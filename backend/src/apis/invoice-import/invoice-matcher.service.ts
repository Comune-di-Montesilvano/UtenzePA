import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ImportIssueType } from './enum/import-issue-type.enum';
import type { ExtractedInvoice, ExtractedReading } from './pattern/pattern-rules';
import { normalizeUtilityCode } from './pattern/utility-code';
import { normalizeInvoiceNumber } from '@apis/accounting-import/invoice-number';
import { invoiceCompetenceYear } from '@apis/spending/line-year';
import * as q from './invoice-matcher.queries';
import type { UtilityRow } from './invoice-matcher.queries';

export interface MatchedLine {
  utility_id_fk: number | null;
  contract_id: number | null;
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

// Matricole confrontabili: senza spazi, maiuscole e zeri iniziali.
export function comparableMeter(meter: string | null | undefined): string {
  return (meter ?? '').replace(/\s/g, '').toUpperCase().replace(/^0+/, '');
}

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

  private get m(): EntityManager {
    return this.dataSource.manager;
  }

  async match(
    extracted: ExtractedInvoice,
    supplierId: number,
    sdiIdentifier: string | null = null,
  ): Promise<MatchResult> {
    const issues: MatchIssue[] = [];
    const utilities = new Map<string, UtilityRow | null>();
    const findUtility = async (code: string): Promise<UtilityRow | null> => {
      const normalized = normalizeUtilityCode(code);
      if (!utilities.has(normalized)) {
        utilities.set(
          normalized,
          await q.utilityByCode(this.m, normalized, code.trim(), supplierId),
        );
      }
      return utilities.get(normalized) ?? null;
    };

    // Senza codici di riga: utenza dal riferimento contratto, se ne indica una sola.
    let refUtility: UtilityRow | null = null;
    if (extracted.contractRef && extracted.lines.every((l) => !l.utility)) {
      const ref = extracted.contractRef.trim();
      const rows = await q.utilitiesOfContractRef(this.m, supplierId, ref);
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
    const cigChecked = new Set<number>();
    const lines: MatchedLine[] = [];
    let headerContract: { id: number; cig_contract: string | null } | null | undefined;
    const contractOfInvoice = async () => {
      if (headerContract !== undefined) return headerContract;
      const cig = extracted.cig?.trim() || null;
      const ref = extracted.contractRef?.trim() || null;
      headerContract = null;
      if (cig || ref) {
        const rows = await q.headerContracts(this.m, supplierId, cig, ref);
        if (rows.length === 1) headerContract = rows[0];
      }
      return headerContract;
    };
    for (const [index, line] of extracted.lines.entries()) {
      const utility = lineUtilities[index];
      const day = line.periodEnd ?? extracted.date;
      let contract: { id: number; cig_contract: string | null } | null;
      if (utility) {
        const contractKey = `${utility.id}|${day}`;
        if (!contracts.has(contractKey)) {
          contracts.set(
            contractKey,
            await q.contractOfUtility(this.m, utility.id, supplierId, day),
          );
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
      lines.push({
        utility_id_fk: utility?.id ?? null,
        contract_id: contract?.id ?? null,
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
    // Impegno per fattura: basta un'annualità del contratto nell'esercizio di
    // competenza; quale e per quanto lo decide il ricalcolo (o il tab Impegni).
    if (headerContracts.length === 1) {
      const year = invoiceCompetenceYear(
        extracted.lines.map((l) => ({ period_start: l.periodStart, period_end: l.periodEnd })),
        extracted.date,
      );
      if (!(await q.hasCommitment(this.m, headerContracts[0], year))) {
        issues.push({
          type: ImportIssueType.MISSING_COMMITMENT,
          lineIndex: null,
          detail: `Nessun impegno per il contratto ${headerContracts[0]}, esercizio ${year}: l'impegno si assegna alla fattura (tab Impegni)`,
        });
      }
    }

    if (extracted.supplierName) {
      const supplier = await q.supplierNames(this.m, supplierId);
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

    let existing: { id: number } | null | undefined = await q.invoiceByNumber(
      this.m,
      supplierId,
      extracted.number,
      extracted.date,
    );
    if (!existing) {
      // Stesso fornitore e data con il numero scritto diversamente (fatture create
      // dalla contabilità o a mano): confronto sul numero normalizzato.
      const candidates = await q.invoicesOfDay(this.m, supplierId, extracted.date);
      const number = normalizeInvoiceNumber(extracted.number);
      existing = candidates.find((c) => normalizeInvoiceNumber(c.invoice_id) === number);
      if (!existing && sdiIdentifier) {
        // Ultimo tentativo: IdentificativoSdI del messaggio (la data del registro
        // della contabilità può differire dall'XML); vale il numero normalizzato.
        const bySdi = await q.invoicesBySdi(this.m, supplierId, sdiIdentifier);
        existing = bySdi.find((c) => normalizeInvoiceNumber(c.invoice_id) === number);
      }
    }

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
