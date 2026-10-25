// Rielaborando una fattura le righe si ricreano: l'impegno scelto a mano (es.
// quello della liquidazione) non deve tornare automatico. Un solo impegno
// manuale sulla fattura vale per tutte le righe nuove; impegni diversi si
// ricollegano per utenza (utenza su più impegni = ambigua, automatica).
export interface PreviousLine {
  utility_id_fk: number | null;
  commitment_id_fk: number | null;
  commitment_auto: boolean;
}

export function keptCommitment(
  previous: PreviousLine[],
): (utilityId: number | null) => number | null {
  const manual = previous.filter((l) => !l.commitment_auto && l.commitment_id_fk);
  const distinct = new Set(manual.map((l) => l.commitment_id_fk));
  if (distinct.size === 0) return () => null;
  if (distinct.size === 1) {
    const only = manual[0].commitment_id_fk;
    return () => only;
  }
  const byUtility = new Map<number, Set<number | null>>();
  for (const l of manual) {
    if (l.utility_id_fk === null) continue;
    const set = byUtility.get(l.utility_id_fk) ?? new Set<number | null>();
    set.add(l.commitment_id_fk);
    byUtility.set(l.utility_id_fk, set);
  }
  return (utilityId) => {
    const set = utilityId === null ? undefined : byUtility.get(utilityId);
    return set && set.size === 1 ? [...set][0] : null;
  };
}
