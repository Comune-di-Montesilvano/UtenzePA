// Contratti da aggiungere a un impegno: quello indicato dal CIG se è uno solo
// più quelli delle fatture pagate sull'impegno. I collegamenti esistenti
// (anche a mano) non si tolgono mai.
export function planCommitmentContracts(
  commitments: { id: number; cig: string | null; contractIds: number[] }[],
  contractsByCig: Map<string, number[]>,
  paidContracts: Map<number, number[]>,
): { commitmentId: number; add: number[] }[] {
  const result: { commitmentId: number; add: number[] }[] = [];
  for (const c of commitments) {
    const fromCig = c.cig ? (contractsByCig.get(c.cig) ?? []) : [];
    const wanted = new Set([...(fromCig.length === 1 ? fromCig : []), ...(paidContracts.get(c.id) ?? [])]);
    const add = [...wanted].filter((id) => !c.contractIds.includes(id)).sort((a, b) => a - b);
    if (add.length) result.push({ commitmentId: c.id, add });
  }
  return result;
}

// Capitolo dell'utenza dalle fatture pagate: quello delle quote della
// ragioneria nell'ultimo esercizio, solo se è uno e diverso dall'attuale.
export function planUtilityChapters(
  rows: { utility_id: number; fiscal_year: number; chapter_id: number }[],
  current: Map<number, number | null>,
): { utilityId: number; chapterId: number }[] {
  const byUtility = new Map<number, { year: number; chapters: Set<number> }>();
  for (const r of rows) {
    const entry = byUtility.get(r.utility_id);
    if (!entry || r.fiscal_year > entry.year) {
      byUtility.set(r.utility_id, { year: r.fiscal_year, chapters: new Set([r.chapter_id]) });
    } else if (r.fiscal_year === entry.year) {
      entry.chapters.add(r.chapter_id);
    }
  }
  const result: { utilityId: number; chapterId: number }[] = [];
  for (const [utilityId, { chapters }] of byUtility) {
    if (chapters.size !== 1) continue;
    const [chapterId] = chapters;
    if ((current.get(utilityId) ?? null) !== chapterId) result.push({ utilityId, chapterId });
  }
  return result;
}
