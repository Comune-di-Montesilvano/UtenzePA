import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { lineYearSql } from './line-year';

// Esercizio di un capitolo: dati della ragioneria (budget_chapter_spending) +
// impegni + fatturato, sempre calcolati. Condiviso da spesa e anomalie.
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

// Voci di spesa per capitolo (ci): quote d'impegno della fattura (capitolo
// dell'impegno, esercizio = annualità della quota) e, per le fatture senza
// quote, le righe (capitolo dell'utenza, competenza del periodo della riga,
// line-year.ts). Solo fatture valide (join con invoices i in coda); stornate e
// note di credito della contabilità escluse (in ragioneria non toccano il
// capitolo: la fattura si liquida al netto).
export const CHAPTER_ITEMS = `FROM (
    SELECT s.id AS share_id, NULL AS line_id, s.invoice_id_fk AS invoice_id, NULL AS utility_id,
           bcm.budget_chapter_id_fk AS chapter_id, s.fiscal_year AS year, s.amount
      FROM invoice_commitment_shares s
      JOIN budget_commitments bcm ON bcm.id = s.commitment_id_fk
    UNION ALL
    SELECT NULL, il.id, il.invoice_id_fk, il.utility_id_fk, u.budget_chapter_code_fk,
           ${lineYearSql({ line: 'il', invoice: 'li' })}, il.amount
      FROM invoice_lines il
      JOIN invoices li ON li.id = il.invoice_id_fk
      LEFT JOIN utilities u ON u.id = il.utility_id_fk
     WHERE NOT EXISTS (SELECT 1 FROM invoice_commitment_shares x WHERE x.invoice_id_fk = il.invoice_id_fk)
  ) ci
  JOIN invoices i ON i.id = ci.invoice_id AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
    AND ${NOT_OFFSET_SQL('i')}`;

// Annualità degli impegni (bcy), contate una volta qualunque sia il numero
// dei contratti collegati: un pluriennale conta in ogni suo esercizio.
export const COMMITMENTS =
  'FROM budget_commitment_years bcy JOIN budget_commitments bcm ON bcm.id = bcy.commitment_id';

// Speso di un'annualità: quote di fatture valide con il suo esercizio.
export const COMMITMENT_SPENT = `(SELECT COALESCE(SUM(ss.amount), 0) FROM invoice_commitment_shares ss
  JOIN invoices si ON si.id = ss.invoice_id_fk AND si.deleted = 0 AND ${NOT_REJECTED_SQL('si')}
  WHERE ss.commitment_id_fk = bcm.id AND ss.fiscal_year = bcy.fiscal_year)`;
// Rimanenza delle annualità con importo (null se nessuna ne ha).
export const COMMITMENTS_REMAINING = `SUM(CASE WHEN bcy.amount IS NULL THEN NULL ELSE bcy.amount - ${COMMITMENT_SPENT} END)`;

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
  query: Query,
  year: number,
): Promise<ChapterYearSummary[]> {
  const budget = await query(
    `SELECT budget_chapter_id_fk AS chapter_id, id, initial_budget, adjusted_budget, amount, notes, source
     FROM budget_chapter_spending WHERE year = ? AND deleted = 0`,
    [year],
  );
  const commitments = await query(
    `SELECT bcm.budget_chapter_id_fk AS chapter_id, COUNT(*) AS commitments, SUM(bcy.amount) AS total,
            SUM(bcy.amount IS NULL) AS without_amount, ${COMMITMENTS_REMAINING} AS remaining
     ${COMMITMENTS}
     WHERE bcy.fiscal_year = ? AND bcm.deleted = 0
     GROUP BY bcm.budget_chapter_id_fk`,
    [year],
  );
  const invoiced = await query(
    `SELECT ci.chapter_id, SUM(ci.amount) AS total, COUNT(DISTINCT ci.invoice_id) AS invoices
     ${CHAPTER_ITEMS}
     WHERE ci.year = ? AND ci.chapter_id IS NOT NULL
     GROUP BY ci.chapter_id`,
    [year],
  );
  const b = byKey(budget, 'chapter_id');
  const c = byKey(commitments, 'chapter_id');
  const i = byKey(invoiced, 'chapter_id');
  const ids = [...new Set([...b.keys(), ...c.keys(), ...i.keys()])].sort((x, y) => x - y);
  return ids.map((id) => ({
    budget_chapter_id: id,
    ...buildChapterYear(year, b.get(id), c.get(id), i.get(id)),
  }));
}
