// Origine di un dato di capitoli, impegni e fatture: MANUAL = inserito in
// UtenzePA, ACCOUNTING = scritto dall'import della contabilità (con l'import
// attivo è in sola lettura).
export enum RecordSource {
  MANUAL = 'MANUAL',
  ACCOUNTING = 'ACCOUNTING',
}
