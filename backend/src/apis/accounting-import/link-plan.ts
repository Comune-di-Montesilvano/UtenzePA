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
    const wanted = new Set([
      ...(fromCig.length === 1 ? fromCig : []),
      ...(paidContracts.get(c.id) ?? []),
    ]);
    const add = [...wanted].filter((id) => !c.contractIds.includes(id)).sort((a, b) => a - b);
    if (add.length) result.push({ commitmentId: c.id, add });
  }
  return result;
}
