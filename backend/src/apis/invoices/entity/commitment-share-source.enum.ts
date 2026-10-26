// Origine di una quota impegno della fattura: AUTO = assegnata dal ricalcolo,
// MANUAL = scelta a mano, ACCOUNTING = dall'import contabile (fase 3).
export enum CommitmentShareSource {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
  ACCOUNTING = 'ACCOUNTING',
}
