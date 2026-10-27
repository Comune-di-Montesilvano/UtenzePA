import type { AccCommitmentRow, AccLiquidationRow } from './accounting-csv';

export interface AccountingScope {
  chapterKeys: Set<string>;
  commitmentKeys: Set<string>;
}

export const chapterKey = (chapter: string, article: number): string => `${chapter}/${article}`;
export const commitmentKey = (row: {
  commitment_year: number;
  commitment_num: number;
  commitment_sub: number;
}): string => `${row.commitment_year}/${row.commitment_num}/${row.commitment_sub}`;

// Perimetro dell'import: capitoli già in UtenzePA più quelli degli impegni con
// almeno una liquidazione valida verso un fornitore del perimetro (soggetti
// con contratto di fornitura); impegni = tutti quelli non annullati su questi
// capitoli.
export function computeScope(
  acc: { commitments: AccCommitmentRow[]; liquidations: AccLiquidationRow[] },
  supplierVats: Set<string>,
  existingChapters: { chapter_code: string; article: number }[],
): AccountingScope {
  const chapterKeys = new Set(existingChapters.map((c) => chapterKey(c.chapter_code, c.article)));
  const paid = new Set(
    acc.liquidations
      .filter((l) => !l.cancelled && l.supplier_vat && supplierVats.has(l.supplier_vat))
      .map(commitmentKey),
  );
  for (const c of acc.commitments) {
    if (!c.cancelled && paid.has(commitmentKey(c)))
      chapterKeys.add(chapterKey(c.chapter, c.article));
  }
  const commitmentKeys = new Set(
    acc.commitments
      .filter((c) => !c.cancelled && chapterKeys.has(chapterKey(c.chapter, c.article)))
      .map(commitmentKey),
  );
  return { chapterKeys, commitmentKeys };
}
