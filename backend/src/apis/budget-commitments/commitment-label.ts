// Numero dell'impegno come lo scrive la ragioneria: anno/num/sub (gemella
// frontend in pages/commitments/commitment-label.ts).
export function commitmentLabel(
  year: number | null | undefined,
  num: number | null | undefined,
  sub: number | null | undefined,
): string {
  if (year === null || year === undefined || num === null || num === undefined) return '—';
  return `${year}/${num}/${sub ?? 1}`;
}
