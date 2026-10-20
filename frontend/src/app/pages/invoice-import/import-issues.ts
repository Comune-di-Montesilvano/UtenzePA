// Differenze trovate dall'import fatture dalla PEC (backend ImportIssueType).
export type ImportIssueType =
  | 'UNKNOWN_UTILITY'
  | 'CIG_MISMATCH'
  | 'SUPPLIER_NAME_MISMATCH'
  | 'MISSING_COMMITMENT'
  | 'PERIOD_COVERED'
  | 'MIXED_CONTRACTS'
  | 'BATCH_NOT_SUPPORTED'
  | 'METER_MISMATCH'
  | 'PDF_DATA_MISSING';

export const IMPORT_ISSUE_LABELS: Record<ImportIssueType, string> = {
  UNKNOWN_UTILITY: 'Utenza sconosciuta',
  CIG_MISMATCH: 'CIG diverso dal contratto',
  SUPPLIER_NAME_MISMATCH: 'Ragione sociale diversa',
  MISSING_COMMITMENT: 'Impegno mancante',
  PERIOD_COVERED: 'Periodo di consumo già coperto',
  MIXED_CONTRACTS: 'Contratti diversi sulle righe',
  BATCH_NOT_SUPPORTED: 'File con più fatture (lotto)',
  METER_MISMATCH: 'Matricola diversa (import fermo)',
  PDF_DATA_MISSING: 'Dati dal PDF non trovati',
};

// Tipi legati a una fattura di UtenzePA (il lotto non ne ha una).
export const INVOICE_ISSUE_SIGNAL_TYPES: ImportIssueType[] = [
  'UNKNOWN_UTILITY',
  'CIG_MISMATCH',
  'SUPPLIER_NAME_MISMATCH',
  'MISSING_COMMITMENT',
  'PERIOD_COVERED',
  'MIXED_CONTRACTS',
  'PDF_DATA_MISSING',
];

export const importIssueLabel = (type: string): string =>
  IMPORT_ISSUE_LABELS[type as ImportIssueType] ?? type;
