// Una riga per utenza dell'immobile senza destinazione, con la destinazione
// del capitolo attuale dell'utenza.
export interface SuggestionRow {
  asset_id: number;
  label: string;
  destination_id: number;
}

export interface DestinationSuggestion {
  asset_id: number;
  label: string;
  destination_id: number;
  // Utenze dell'immobile considerate (con un capitolo con destinazione).
  utilities: number;
}

// Proposta per il primo popolamento: la destinazione più frequente tra i
// capitoli delle utenze dell'immobile; a pari merito nessuna proposta.
export function suggestDestinations(rows: SuggestionRow[]): DestinationSuggestion[] {
  const byAsset = new Map<number, { label: string; counts: Map<number, number>; n: number }>();
  for (const r of rows) {
    const a = byAsset.get(r.asset_id) ?? { label: r.label, counts: new Map(), n: 0 };
    a.counts.set(r.destination_id, (a.counts.get(r.destination_id) ?? 0) + 1);
    a.n++;
    byAsset.set(r.asset_id, a);
  }
  const out: DestinationSuggestion[] = [];
  for (const [asset_id, a] of byAsset) {
    const sorted = [...a.counts].sort((x, y) => y[1] - x[1]);
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) continue;
    out.push({ asset_id, label: a.label, destination_id: sorted[0][0], utilities: a.n });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label, 'it'));
}
