// Ordine in bozza: contratto di fornitura non ancora emesso (CIG
// facoltativo, date previste obbligatorie). Serve solo al calcolo del
// fabbisogno della convenzione: non vale come contratto in nessun altro
// controllo, quindi ogni query che cerca un contratto «valido» lo esclude.
export const NOT_DRAFT_SQL = (alias: string): string => `${alias}.draft = 0`;

export interface DraftState {
  draft?: boolean | null;
  closed?: boolean | null;
  supply_start_date?: string | null;
  supply_expiry_date?: string | null;
}

/**
 * Messaggio d'errore per la UI, o null se lo stato è ammesso.
 * `next` = stato risultante dal salvataggio, `before` = stato salvato
 * (assente in creazione).
 */
export function draftError(next: DraftState, before?: Pick<DraftState, 'draft'>): string | null {
  if (!next.draft) return null;
  if (before && !before.draft) return 'Un contratto già emesso non può tornare in bozza.';
  if (next.closed) return 'Una bozza non può essere chiusa: eliminala oppure togli la spunta Bozza.';
  if (!next.supply_start_date || !next.supply_expiry_date) {
    return 'Una bozza deve avere le date di fornitura previste (inizio e scadenza).';
  }
  return null;
}
