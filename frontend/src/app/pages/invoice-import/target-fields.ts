import type {TargetField} from './pattern-rules.model';

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
  unit: 'Unità di misura',
  meter: 'Matricola contatore',
  estimated: 'Consumo stimato',
};

// Campi di testata con un percorso standard del tracciato: senza regola valgono quello.
export const HEADER_DEFAULTS: TargetField[] = ['supplierName', 'number', 'date', 'documentType'];
