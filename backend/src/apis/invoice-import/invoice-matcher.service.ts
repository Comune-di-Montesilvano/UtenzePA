import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ImportIssueType } from './enum/import-issue-type.enum';
import type { ExtractedInvoice, ExtractedReading } from './pattern/pattern-rules';
import { normalizeUtilityCode } from './pattern/utility-code';

export interface MatchedLine {
  utility_id_fk: number | null;
  contract_id: number | null;
  commitment_id_fk: number | null;
  period_start: string | null;
  period_end: string | null;
  amount: number;
  consumption: number | null;
  // Consumo per fascia letto in fattura (null = non letto).
  bands: [number | null, number | null, number | null];
  estimated: boolean;
  // Letture del contatore lette in fattura (data, valore, stimata).
  readings: ExtractedReading[];
  description: string | null;
  supply_code: string | null;
}

export interface MatchIssue {
  type: ImportIssueType;
  lineIndex: number | null;
  detail: string;
  utilityId?: number;
  value?: string;
}

export interface MeterFound {
  utilityId: number;
  meter: string;
  // Matricola in anagrafica prima dell'aggiornamento (null = vuota).
  previous?: string | null;
}

export interface MatchResult {
  supplierId: number;
  existingInvoiceId: number | null;
  contratto_id_fk: number | null;
  lines: MatchedLine[];
  issues: MatchIssue[];
  // Differenze che fermano l'import della fattura finché non si risolvono.
  blocking: MatchIssue[];
  // Matricola letta in fattura per utenza; da scrivere dove l'utenza non l'ha o
  // ne ha una diversa (vale quella della fattura).
  meters: MeterFound[];
  meterFills: MeterFound[];
}

interface UtilityRow {
  id: number;
  budget_chapter_code_fk: number | null;
  meter_number?: string | null;
}

// Matricole confrontabili: senza spazi, maiuscole e zeri iniziali.
export function comparableMeter(meter: string | null | undefined): string {
  return (meter ?? '').replace(/\s/g, '').toUpperCase().replace(/^0+/, '');
}

// Il marcatore /* m_… */ identifica la query (anche nei test).
// Il codice cliente è del fornitore: vale solo sulle utenze con un suo contratto.
const UTILITY_SQL =
  '/* m_utility */ SELECT u.id, u.budget_chapter_code_fk, u.meter_number FROM utilities u WHERE u.deleted = 0 ' +
  'AND (u.utility_id = ? OR (u.utility_code = ? AND EXISTS (SELECT 1 FROM contract_utilities cu ' +
  'JOIN contracts c ON c.id = cu.contract_id WHERE cu.utility_id = u.id AND c.supplier_id_fk = ? AND c.deleted = 0))) ' +
  'ORDER BY u.utility_id = ? DESC, u.id LIMIT 1';
const CONTRACT_REF_SQL =
  '/* m_contract_ref */ SELECT DISTINCT u.id, u.budget_chapter_code_fk, u.meter_number FROM contracts c ' +
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
// Contratto della fattura dal CIG o dal riferimento ordine, per le righe senza utenza
// (canoni di contratto, sedi senza codice): vale solo se ne indica uno.
const HEADER_CONTRACT_SQL =
  '/* m_header_contract */ SELECT id, cig_contract FROM contracts WHERE deleted = 0 AND supplier_id_fk = ? ' +
  'AND (TRIM(cig_contract) IN (?, ?) OR TRIM(consip_order) = ?) LIMIT 2';
// Impegno di una riga senza utenza (nessun capitolo da cui partire): l'unico del contratto nell'esercizio.
const CONTRACT_COMMITMENT_SQL =
  '/* m_contract_commitment */ SELECT id FROM budget_commitments WHERE deleted = 0 ' +
  'AND contract_id_fk = ? AND fiscal_year = ? LIMIT 2';
const COMMITMENT_SQL =
  '/* m_commitment */ SELECT id FROM budget_commitments WHERE deleted = 0 ' +
  'AND contract_id_fk = ? AND budget_chapter_id_fk = ? AND fiscal_year = ? LIMIT 1';
const SUPPLIER_SQL =
  '/* m_supplier */ SELECT company_name, last_name, first_name FROM third_parties WHERE id = ?';
const INVOICE_SQL =
  '/* m_invoice */ SELECT id FROM invoices WHERE deleted = 0 AND supplier_id_fk = ? ' +
  'AND invoice_id = ? AND invoice_date = ? ORDER BY id LIMIT 1';

// Ragione sociale confrontabile: senza maiuscole, punteggiatura, «con socio unico» e forma societaria finale.
export function comparableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(con|a)sociounico$/, '')
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
          supplierId,
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

    // Matricola: la prima letta per utenza; vuota o diversa in anagrafica = si scrive quella della fattura.
    const meters: MeterFound[] = [];
    const meterFills: MeterFound[] = [];
    const blocking: MatchIssue[] = [];
    for (const [index, line] of extracted.lines.entries()) {
      const utility = lineUtilities[index];
      const meter = line.meter?.trim();
      if (!utility || !meter || meters.some((m) => m.utilityId === utility.id)) continue;
      meters.push({ utilityId: utility.id, meter, previous: utility.meter_number || null });
      if (comparableMeter(utility.meter_number) !== comparableMeter(meter)) {
        meterFills.push({ utilityId: utility.id, meter, previous: utility.meter_number || null });
      }
    }

    const contracts = new Map<string, { id: number; cig_contract: string | null } | null>();
    const commitments = new Map<string, number | null>();
    const cigChecked = new Set<number>();
    const lines: MatchedLine[] = [];
    let headerContract: { id: number; cig_contract: string | null } | null | undefined;
    const contractOfInvoice = async () => {
      if (headerContract !== undefined) return headerContract;
      const cig = extracted.cig?.trim() || null;
      const ref = extracted.contractRef?.trim() || null;
      headerContract = null;
      if (cig || ref) {
        const rows = await this.dataSource.query(HEADER_CONTRACT_SQL, [supplierId, cig, ref, ref]);
        if (rows.length === 1) headerContract = rows[0];
      }
      return headerContract;
    };
    for (const [index, line] of extracted.lines.entries()) {
      const utility = lineUtilities[index];
      const day = line.periodEnd ?? extracted.date;
      let contract: { id: number; cig_contract: string | null } | null;
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
      } else {
        contract = await contractOfInvoice();
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
      } else if (contract && !utility) {
        const year = Number(day.slice(0, 4));
        const key = `${contract.id}|*|${year}`;
        if (!commitments.has(key)) {
          const rows = await this.dataSource.query(CONTRACT_COMMITMENT_SQL, [contract.id, year]);
          commitments.set(key, rows.length === 1 ? rows[0].id : null);
          if (rows.length !== 1) {
            issues.push({
              type: ImportIssueType.MISSING_COMMITMENT,
              lineIndex: index,
              detail: rows.length
                ? `Più impegni per il contratto ${contract.id}, esercizio ${year}: scegliere quello della riga`
                : `Nessun impegno per il contratto ${contract.id}, esercizio ${year}`,
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
        bands: [line.consumptionF1, line.consumptionF2, line.consumptionF3],
        estimated: line.estimated,
        readings: line.readings ?? [],
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
      blocking,
      meters,
      meterFills,
    };
  }
}
