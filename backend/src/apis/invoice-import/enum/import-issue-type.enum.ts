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
  // Il pattern legge dati dal PDF ma in questa fattura non li trova (PDF assente o
  // layout cambiato): la fattura si importa, il pattern va controllato.
  PDF_DATA_MISSING = 'PDF_DATA_MISSING',
}
