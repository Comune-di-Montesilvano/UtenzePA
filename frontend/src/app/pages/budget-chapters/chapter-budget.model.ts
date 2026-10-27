import type {HardType} from '../utility-types/enum/hard-type.enum';

// Dati calcolati del capitolo per esercizio (gemelli di apis/spending/chapter-year.ts
// e spending.service.ts): mai salvati, solo letti.
export interface ChapterYear {
  year: number;
  spending_id: number | null;
  // MANUAL o ACCOUNTING (dalla contabilità).
  spending_source: string | null;
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
  // Somma delle rimanenze degli impegni dell'esercizio (null = nessun importo noto).
  remaining: number | null;
  over_budget: boolean;
}

export interface ChapterYearSummary extends ChapterYear {
  budget_chapter_id: number;
}

export interface ChapterCommitment {
  id: number;
  label: string;
  // Prima annualità e tutte le annualità (pluriennale); importi sommati.
  fiscal_year: number;
  fiscal_years: number[];
  amount: number | null;
  spent: number;
  remaining: number | null;
  supplier: string | null;
  contract_ids: number[];
}

// Fatturato del capitolo: quota d'impegno della fattura (kind 'share', senza
// utenza) o riga senza quote sul capitolo della sua utenza (kind 'line').
export interface ChapterInvoiceLine {
  id: number;
  kind: 'share' | 'line';
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
  lines: {
    utility_id_fk: number | null;
    amount: number;
    period_start?: string | null;
    period_end?: string | null;
  }[];
  // Quote a mano della fattura in modifica; null = automatiche.
  commitment_shares?: {commitment_id_fk: number; fiscal_year: number | null; amount: number}[] | null;
}

// Statistiche delle utenze del capitolo in un periodo
// (GET /budget-chapters/:id/utility-stats).
export type StatsOutlier = 'unit_cost' | 'change';

export interface ChapterUtilityStatsRow {
  id: number;
  utility_code: string | null;
  type_name: string | null;
  hard_type: HardType | null;
  active: boolean;
  spend: number;
  previous_spend: number;
  // Variazione sul periodo precedente (0,25 = +25 %); null = non confrontabile.
  change: number | null;
  comparable: boolean;
  unit: string | null;
  consumption: number | null;
  unit_cost: number | null;
  outliers: StatsOutlier[];
}

export interface ChapterTypeStats {
  hard_type: HardType | null;
  unit: string | null;
  utilities: number;
  spend: number;
  consumption: number | null;
  unit_cost: number | null;
}

export interface ChapterUtilityStats {
  period: {start: string; end: string; previous_start: string; previous_end: string};
  summary: {
    spend: number;
    previous_spend: number;
    change: number | null;
    compared_utilities: number;
    active_utilities: number;
    average_per_active: number | null;
    types: ChapterTypeStats[];
  };
  utilities: ChapterUtilityStatsRow[];
  years: number[];
}
