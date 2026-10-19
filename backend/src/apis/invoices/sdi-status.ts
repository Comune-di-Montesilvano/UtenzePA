import { SdiStatus } from './enum/sdi-status.enum';

export interface SdiEvent {
  kind: 'INVOICE' | 'EC' | 'DT' | 'SE';
  outcome: 'EC01' | 'EC02' | null;
  at: Date;
}

/**
 * Stato della fattura dai messaggi SDI. L'ultimo esito committente valido
 * decide; uno scarto dell'esito (SE) annulla l'esito che lo precede e lascia
 * l'avviso finché non arriva un esito nuovo; senza esito valido conta la
 * decorrenza dei termini.
 */
export function deriveSdiStatus(events: SdiEvent[]): {
  status: SdiStatus | null;
  outcomeDiscarded: boolean;
} {
  if (!events.some((e) => e.kind === 'INVOICE')) return { status: null, outcomeDiscarded: false };
  let outcome: 'EC01' | 'EC02' | null = null;
  let deadline = false;
  let outcomeDiscarded = false;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.kind === 'EC' && e.outcome) {
      outcome = e.outcome;
      outcomeDiscarded = false;
    } else if (e.kind === 'SE') {
      outcome = null;
      outcomeDiscarded = true;
    } else if (e.kind === 'DT') {
      deadline = true;
    }
  }
  const status =
    outcome === 'EC01'
      ? SdiStatus.ACCEPTED
      : outcome === 'EC02'
        ? SdiStatus.REJECTED
        : deadline
          ? SdiStatus.DEADLINE_PASSED
          : SdiStatus.RECEIVED;
  return { status, outcomeDiscarded };
}

// Valore del filtro elenco per le fatture senza messaggio SDI.
export const SDI_STATUS_NONE = 'NONE';

// Le fatture rifiutate non hanno effetti: fuori da ogni somma di spesa.
export const NOT_REJECTED_SQL = (alias: string): string =>
  `(${alias}.sdi_status IS NULL OR ${alias}.sdi_status <> '${SdiStatus.REJECTED}')`;
