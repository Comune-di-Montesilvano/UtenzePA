import { EntityManager } from 'typeorm';
import { yearInvoiced } from './chapter-items.sql';
import { yearBudgets, yearCommitted } from './spending.queries';

// Esercizio di un capitolo: dati della ragioneria (budget_chapter_spending) +
// impegni + fatturato, sempre calcolati. Condiviso da spesa e anomalie.

export interface ChapterYear {
  year: number;
  spending_id: number | null;
  // MANUAL o ACCOUNTING: dalla contabilità in sola lettura con l'import attivo.
  spending_source: string | null;
  initial_budget: number | null;
  adjusted_budget: number | null;
  recorded_spending: number | null;
  notes: string | null;
  committed: number;
  commitments: number;
  commitments_without_amount: number;
  // Somma delle rimanenze degli impegni con importo; null se nessuno ne ha.
  remaining: number | null;
  invoiced: number;
  invoices: number;
  available: number | null;
  over_budget: boolean;
}

export interface ChapterYearSummary extends ChapterYear {
  budget_chapter_id: number;
}

export const currentYear = (): number => new Date().getFullYear();

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildChapterYear(
  year: number,
  budget?: Record<string, unknown>,
  commitments?: Record<string, unknown>,
  invoiced?: Record<string, unknown>,
): ChapterYear {
  const adjusted = num(budget?.adjusted_budget);
  const committed = round2(Number(commitments?.total ?? 0));
  const inv = round2(Number(invoiced?.total ?? 0));
  return {
    year,
    spending_id: num(budget?.id),
    spending_source: (budget?.source as string | undefined) ?? null,
    initial_budget: num(budget?.initial_budget),
    adjusted_budget: adjusted,
    recorded_spending: num(budget?.amount),
    notes: (budget?.notes as string | null | undefined) ?? null,
    committed,
    commitments: Number(commitments?.commitments ?? 0),
    commitments_without_amount: Number(commitments?.without_amount ?? 0),
    remaining: num(commitments?.remaining) === null ? null : round2(Number(commitments?.remaining)),
    invoiced: inv,
    invoices: Number(invoiced?.invoices ?? 0),
    available: adjusted === null ? null : round2(adjusted - committed),
    over_budget: adjusted !== null && (committed > adjusted || inv > adjusted),
  };
}

const byKey = (rows: Record<string, unknown>[], key: string) =>
  new Map(rows.map((r) => [Number(r[key]), r] as const));

export function mergeChapterYears(
  budget: Record<string, unknown>[],
  commitments: Record<string, unknown>[],
  invoiced: Record<string, unknown>[],
  current: number,
): ChapterYear[] {
  const b = byKey(budget, 'year');
  const c = byKey(commitments, 'year');
  const i = byKey(invoiced, 'year');
  const years = new Set([...b.keys(), ...c.keys(), ...i.keys(), current]);
  return [...years]
    .sort((x, y) => y - x)
    .map((y) => buildChapterYear(y, b.get(y), c.get(y), i.get(y)));
}

// Tutti i capitoli con dati nell'esercizio (elenco capitoli, anomalie).
export async function chaptersYearSummary(
  m: EntityManager,
  year: number,
): Promise<ChapterYearSummary[]> {
  const budget = await yearBudgets(m, year);
  const commitments = await yearCommitted(m, year);
  const invoiced = await yearInvoiced(m, year);
  const b = byKey(budget, 'chapter_id');
  const c = byKey(commitments, 'chapter_id');
  const i = byKey(invoiced, 'chapter_id');
  const ids = [...new Set([...b.keys(), ...c.keys(), ...i.keys()])].sort((x, y) => x - y);
  return ids.map((id) => ({
    budget_chapter_id: id,
    ...buildChapterYear(year, b.get(id), c.get(id), i.get(id)),
  }));
}
