// Esito dell'elaborazione di un file SDI letto dalla PEC.
export enum SdiMessageStatus {
  LINKED = 'LINKED', // fattura collegata a una fattura di UtenzePA
  EXTRACTED = 'EXTRACTED', // fattura creata o arricchita da un pattern
  IGNORED = 'IGNORED', // struttura che il fornitore ha marcato da ignorare
  PENDING = 'PENDING', // fornitore in perimetro, fattura non ancora in UtenzePA
  OUT_OF_SCOPE = 'OUT_OF_SCOPE', // fornitore non in anagrafica o senza contratti di fornitura
  NOTIFICATION = 'NOTIFICATION', // esito committente, decorrenza termini, scarto esito
  ERROR = 'ERROR',
}

export type SdiMessageKind = 'INVOICE' | 'EC' | 'DT' | 'SE';
