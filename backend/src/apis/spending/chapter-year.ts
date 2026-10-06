// Esercizio di un capitolo: dati della ragioneria (budget_chapter_spending) +
// impegni + fatturato, sempre calcolati. Condiviso da spesa e anomalie.
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

// Riga fattura: esercizio e capitolo dall'impegno, altrimenti anno della
// fattura e capitolo dell'utenza (stesse regole di apis/spending).
export const LINE_YEAR = 'COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))';
export const LINE_CHAPTER = 'COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk)';
export const CHAPTER_LINES = `FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
  LEFT JOIN budget_commitments bcm ON bcm.id = il.commitment_id_fk
  LEFT JOIN utilities u ON u.id = il.utility_id_fk`;

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
    initial_budget: num(budget?.initial_budget),
    adjusted_budget: adjusted,
    recorded_spending: num(budget?.amount),
    notes: (budget?.notes as string | null | undefined) ?? null,
    committed,
    commitments: Number(commitments?.commitments ?? 0),
    commitments_without_amount: Number(commitments?.without_amount ?? 0),
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
  return [...years].sort((x, y) => y - x).map((y) => buildChapterYear(y, b.get(y), c.get(y), i.get(y)));
}

// Tutti i capitoli con dati nell'esercizio (elenco capitoli, anomalie).
export async function chaptersYearSummary(query: Query, year: number): Promise<ChapterYearSummary[]> {
  const budget = await query(
    `SELECT budget_chapter_id_fk AS chapter_id, id, initial_budget, adjusted_budget, amount, notes
     FROM budget_chapter_spending WHERE year = ? AND deleted = 0`,
    [year],
  );
  const commitments = await query(
    `SELECT budget_chapter_id_fk AS chapter_id, COUNT(*) AS commitments, SUM(amount) AS total,
            SUM(amount IS NULL) AS without_amount
     FROM budget_commitments WHERE fiscal_year = ? AND deleted = 0
     GROUP BY budget_chapter_id_fk`,
    [year],
  );
  const invoiced = await query(
    `SELECT ${LINE_CHAPTER} AS chapter_id, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
     ${CHAPTER_LINES}
     WHERE ${LINE_YEAR} = ? AND ${LINE_CHAPTER} IS NOT NULL
     GROUP BY chapter_id`,
    [year],
  );
  const b = byKey(budget, 'chapter_id');
  const c = byKey(commitments, 'chapter_id');
  const i = byKey(invoiced, 'chapter_id');
  const ids = [...new Set([...b.keys(), ...c.keys(), ...i.keys()])].sort((x, y) => x - y);
  return ids.map((id) => ({ budget_chapter_id: id, ...buildChapterYear(year, b.get(id), c.get(id), i.get(id)) }));
}
