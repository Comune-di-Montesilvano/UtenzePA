import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ImportIssueType } from './enum/import-issue-type.enum';
import type { ExtractedInvoice } from './pattern/pattern-rules';
import { normalizeUtilityCode } from './pattern/utility-code';

export interface MatchedLine {
  utility_id_fk: number | null;
  contract_id: number | null;
  commitment_id_fk: number | null;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  consumption: number | null;
  description: string | null;
  supply_code: string | null;
}

export interface MatchIssue {
  type: ImportIssueType;
  lineIndex: number | null;
  detail: string;
}

export interface MatchResult {
  supplierId: number;
  existingInvoiceId: number | null;
  contratto_id_fk: number | null;
  lines: MatchedLine[];
  issues: MatchIssue[];
}

interface UtilityRow {
  id: number;
  budget_chapter_code_fk: number | null;
}

// Il marcatore /* m_… */ identifica la query (anche nei test).
const UTILITY_SQL =
  '/* m_utility */ SELECT id, budget_chapter_code_fk FROM utilities WHERE deleted = 0 ' +
  'AND (utility_id = ? OR utility_code = ?) ORDER BY utility_id = ? DESC, id LIMIT 1';
const CONTRACT_REF_SQL =
  '/* m_contract_ref */ SELECT DISTINCT u.id, u.budget_chapter_code_fk FROM contracts c ' +
  'JOIN contract_utilities cu ON cu.contract_id = c.id ' +
  'JOIN utilities u ON u.id = cu.utility_id AND u.deleted = 0 ' +
  'WHERE c.deleted = 0 AND c.supplier_id_fk = ? AND (c.consip_order = ? OR c.cig_contract = ?) LIMIT 2';
const CONTRACT_SQL =
  '/* m_contract */ SELECT c.id, c.cig_contract FROM contracts c ' +
  'JOIN contract_utilities cu ON cu.contract_id = c.id ' +
  'WHERE cu.utility_id = ? AND c.supplier_id_fk = ? AND c.deleted = 0 ' +
  'AND (c.supply_start_date IS NULL OR c.supply_start_date <= ?) ' +
  'AND (c.supply_expiry_date IS NULL OR c.supply_expiry_date >= ?) ' +
  'ORDER BY c.supply_start_date DESC, c.id DESC LIMIT 1';
const COMMITMENT_SQL =
  '/* m_commitment */ SELECT id FROM budget_commitments WHERE deleted = 0 ' +
  'AND contract_id_fk = ? AND budget_chapter_id_fk = ? AND fiscal_year = ? LIMIT 1';
const SUPPLIER_SQL =
  '/* m_supplier */ SELECT company_name, last_name, first_name FROM third_parties WHERE id = ?';
const INVOICE_SQL =
  '/* m_invoice */ SELECT id FROM invoices WHERE deleted = 0 AND supplier_id_fk = ? ' +
  'AND invoice_id = ? AND invoice_date = ? ORDER BY id LIMIT 1';

// Ragione sociale confrontabile: senza maiuscole, punteggiatura e forma societaria finale.
export function comparableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(spa|srl|srls|sapa|scarl|scpa|snc|sas|societacooperativa|soccoop)$/, '');
}

/**
 * Traduce la fattura estratta nella fattura di UtenzePA: utenze, contratto,
 * impegni e fattura già presente. Sola lettura: le differenze con l'anagrafica
 * diventano segnalazioni, mai modifiche.
 */
@Injectable()
export class InvoiceMatcher {
  constructor(private readonly dataSource: DataSource) {}

  async match(extracted: ExtractedInvoice, supplierId: number): Promise<MatchResult> {
    const issues: MatchIssue[] = [];
    const utilities = new Map<string, UtilityRow | null>();
    const findUtility = async (code: string): Promise<UtilityRow | null> => {
      const normalized = normalizeUtilityCode(code);
      if (!utilities.has(normalized)) {
        const rows: UtilityRow[] = await this.dataSource.query(UTILITY_SQL, [
          normalized,
          code.trim(),
          normalized,
        ]);
        utilities.set(normalized, rows[0] ?? null);
      }
      return utilities.get(normalized) ?? null;
    };

    // Senza codici di riga: utenza dal riferimento contratto, se ne indica una sola.
    let refUtility: UtilityRow | null = null;
    if (extracted.contractRef && extracted.lines.every((l) => !l.utility)) {
      const ref = extracted.contractRef.trim();
      const rows: UtilityRow[] = await this.dataSource.query(CONTRACT_REF_SQL, [
        supplierId,
        ref,
        ref,
      ]);
      if (rows.length === 1) refUtility = rows[0];
    }

    const unknown = new Set<string>();
    const lineUtilities: (UtilityRow | null)[] = [];
    for (const [index, line] of extracted.lines.entries()) {
      if (!line.utility) {
        lineUtilities.push(refUtility);
        continue;
      }
      const found = await findUtility(line.utility);
      if (!found && !unknown.has(line.utility)) {
        unknown.add(line.utility);
        issues.push({
          type: ImportIssueType.UNKNOWN_UTILITY,
          lineIndex: index,
          detail: `Utenza ${line.utility} non trovata in anagrafica`,
        });
      }
      lineUtilities.push(found);
    }

    // Righe senza codice (es. indennizzi) in una fattura con una sola utenza: la ereditano.
    const distinct = [...new Map(lineUtilities.filter(Boolean).map((u) => [u!.id, u!])).values()];
    if (distinct.length === 1) {
      extracted.lines.forEach((line, i) => {
        if (!line.utility && !lineUtilities[i]) lineUtilities[i] = distinct[0];
      });
    }

    const contracts = new Map<string, { id: number; cig_contract: string | null } | null>();
    const commitments = new Map<string, number | null>();
    const cigChecked = new Set<number>();
    const lines: MatchedLine[] = [];
    for (const [index, line] of extracted.lines.entries()) {
      const utility = lineUtilities[index];
      const day = line.periodEnd ?? extracted.date;
      let contract: { id: number; cig_contract: string | null } | null = null;
      let commitmentId: number | null = null;
      if (utility) {
        const contractKey = `${utility.id}|${day}`;
        if (!contracts.has(contractKey)) {
          const rows = await this.dataSource.query(CONTRACT_SQL, [
            utility.id,
            supplierId,
            day,
            day,
          ]);
          contracts.set(contractKey, rows[0] ?? null);
        }
        contract = contracts.get(contractKey) ?? null;
      }
      if (contract && extracted.cig && !cigChecked.has(contract.id)) {
        cigChecked.add(contract.id);
        if (contract.cig_contract && contract.cig_contract.trim() !== extracted.cig.trim()) {
          issues.push({
            type: ImportIssueType.CIG_MISMATCH,
            lineIndex: index,
            detail: `CIG fattura ${extracted.cig}, contratto ${contract.cig_contract}`,
          });
        }
      }
      if (contract && utility?.budget_chapter_code_fk) {
        const year = Number(day.slice(0, 4));
        const key = `${contract.id}|${utility.budget_chapter_code_fk}|${year}`;
        if (!commitments.has(key)) {
          const rows = await this.dataSource.query(COMMITMENT_SQL, [
            contract.id,
            utility.budget_chapter_code_fk,
            year,
          ]);
          commitments.set(key, rows[0]?.id ?? null);
          if (!rows[0]) {
            issues.push({
              type: ImportIssueType.MISSING_COMMITMENT,
              lineIndex: index,
              detail: `Nessun impegno per il contratto ${contract.id}, capitolo ${utility.budget_chapter_code_fk}, esercizio ${year}`,
            });
          }
        }
        commitmentId = commitments.get(key) ?? null;
      }
      lines.push({
        utility_id_fk: utility?.id ?? null,
        contract_id: contract?.id ?? null,
        commitment_id_fk: commitmentId,
        period_start: line.periodStart,
        period_end: line.periodEnd,
        amount: line.amount,
        consumption: line.consumption,
        description: line.description ? line.description.slice(0, 255) : null,
        supply_code: line.utility ? line.utility.slice(0, 50) : null,
      });
    }

    const headerContracts = [
      ...new Set(lines.map((l) => l.contract_id).filter((id) => id !== null)),
    ];
    if (headerContracts.length > 1) {
      issues.push({
        type: ImportIssueType.MIXED_CONTRACTS,
        lineIndex: null,
        detail: `Righe su contratti diversi (${headerContracts.join(', ')}): contratto di testata non impostato`,
      });
    }

    if (extracted.supplierName) {
      const [supplier] = await this.dataSource.query(SUPPLIER_SQL, [supplierId]);
      const registered =
        supplier?.company_name ||
        [supplier?.last_name, supplier?.first_name].filter(Boolean).join(' ');
      if (registered && comparableName(registered) !== comparableName(extracted.supplierName)) {
        issues.push({
          type: ImportIssueType.SUPPLIER_NAME_MISMATCH,
          lineIndex: null,
          detail: `Ragione sociale in fattura «${extracted.supplierName}», in anagrafica «${registered}»`,
        });
      }
    }

    const [existing] = await this.dataSource.query(INVOICE_SQL, [
      supplierId,
      extracted.number,
      extracted.date,
    ]);

    return {
      supplierId,
      existingInvoiceId: existing?.id ?? null,
      contratto_id_fk: headerContracts.length === 1 ? headerContracts[0] : null,
      lines,
      issues,
    };
  }
}
