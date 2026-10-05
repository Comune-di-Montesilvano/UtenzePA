export interface YearSpending {
  year: number;
  total: number;
  invoices: number;
}

export interface AssetSpending {
  years: YearSpending[];
  shared_utilities: number;
}

export interface ChapterSummary {
  budget_chapter_id: number | null;
  chapter_code: string | null;
  article: number | null;
  description: string | null;
  utilities: number;
  committed: {year: number; amount: number | null; commitment_id: number}[];
  spent: {year: number; total: number}[];
}
