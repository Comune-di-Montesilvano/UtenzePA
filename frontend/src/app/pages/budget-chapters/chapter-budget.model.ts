// Dati calcolati del capitolo per esercizio (gemelli di apis/spending/chapter-year.ts
// e spending.service.ts): mai salvati, solo letti.
export interface ChapterYear {
  year: number;
  spending_id: number | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  recorded_spending: number | null;
  notes: string | null;
  committed: number;
  commitments: number;
  commitments_without_amount: number;
  invoiced: number;
  invoices: number;
  available: number | null;
  over_budget: boolean;
}

export interface ChapterYearSummary extends ChapterYear {
  budget_chapter_id: number;
}

export interface ChapterCommitment {
  id: number;
  contract_id: number;
  fiscal_year: number;
  commitment_number: string | null;
  amount: number | null;
  cig_contract: string | null;
  supplier: string | null;
}

export interface ChapterInvoiceLine {
  id: number;
  invoice_id: number;
  number: string;
  invoice_date: string;
  supplier: string | null;
  utility_id: number | null;
  utility_code: string | null;
  year: number;
  amount: number;
}

export interface BudgetWarning {
  budget_chapter_id: number;
  chapter: string;
  year: number;
  invoiced: number;
  adjusted_budget: number;
}

export interface BudgetCheckPayload {
  invoice_id?: number | null;
  invoice_date: string;
  lines: {utility_id_fk: number | null; commitment_id_fk: number | null; amount: number}[];
}
