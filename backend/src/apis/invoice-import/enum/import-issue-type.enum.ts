// Differenze trovate dall'import rispetto all'anagrafica: l'import non la
// modifica mai, le segnala (dashboard ed elenco fatture).
export enum ImportIssueType {
  UNKNOWN_UTILITY = 'UNKNOWN_UTILITY',
  CIG_MISMATCH = 'CIG_MISMATCH',
  SUPPLIER_NAME_MISMATCH = 'SUPPLIER_NAME_MISMATCH',
  MISSING_COMMITMENT = 'MISSING_COMMITMENT',
  PERIOD_COVERED = 'PERIOD_COVERED',
  MIXED_CONTRACTS = 'MIXED_CONTRACTS',
  BATCH_NOT_SUPPORTED = 'BATCH_NOT_SUPPORTED',
  // Bloccante: POD trovato ma matricola diversa da quella in anagrafica.
  METER_MISMATCH = 'METER_MISMATCH',
}
