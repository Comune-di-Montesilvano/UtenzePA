import {READING_TARGETS, type ReadingTarget, type TargetField} from './pattern-rules.model';

const READING_PARTS: Record<string, string> = {Date: 'data', Value: 'valore', Type: 'tipo (rilevata / stimata)'};

// Etichette dei campi di UtenzePA nell'editor dei pattern.
export const TARGET_LABELS: Record<TargetField, string> = {
  supplierVat: 'P.IVA del fornitore',
  supplierName: 'Ragione sociale',
  number: 'Numero fattura',
  date: 'Data fattura',
  documentType: 'Tipo documento',
  total: 'Totale (IVA inclusa)',
  netAmount: 'Imponibile',
  cig: 'CIG',
  contractRef: 'Riferimento contratto',
  utility: 'Utenza (POD, PDR, codice)',
  periodStart: 'Inizio periodo',
  periodEnd: 'Fine periodo',
  amount: 'Importo della riga',
  description: 'Descrizione',
  consumption: 'Consumo',
  consumptionF1: 'Consumo F1',
  consumptionF2: 'Consumo F2',
  consumptionF3: 'Consumo F3',
  unit: 'Unità di misura',
  meter: 'Matricola contatore',
  estimated: 'Consumo stimato',
  ...(Object.fromEntries(
    READING_TARGETS.map(t => {
      const [, slot, part] = /^reading(\d)(\w+)$/.exec(t)!;
      return [t, `Lettura ${slot}: ${READING_PARTS[part]}`];
    }),
  ) as Record<ReadingTarget, string>),
};

// Campi di testata con un percorso standard del tracciato: senza regola valgono quello.
export const HEADER_DEFAULTS: TargetField[] = ['supplierName', 'number', 'date', 'documentType'];
