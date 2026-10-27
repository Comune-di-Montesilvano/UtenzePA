import type { AuditFieldChange } from '@apis/audit-log/audit-log.service';
import type { AccChapterRow } from './accounting-csv';
import { RecordSource } from './record-source.enum';
import { chapterKey } from './scope';

export interface CurrentChapter {
  id: number;
  chapter_code: string;
  article: number;
}

export interface CurrentSpending {
  id: number;
  budget_chapter_id_fk: number;
  year: number;
  initial_budget: number | null;
  adjusted_budget: number | null;
  amount: number | null;
  source: RecordSource;
}

export interface SpendingValues {
  initial_budget: number | null;
  adjusted_budget: number | null;
  amount: number | null;
  source: RecordSource;
}

export type ChapterChange =
  | { kind: 'createChapter'; chapter: string; article: number; description: string | null }
  | { kind: 'createSpending'; chapterKey: string; year: number; values: SpendingValues }
  | { kind: 'updateSpending'; id: number; values: SpendingValues; fields: AuditFieldChange[] }
  | { kind: 'deleteSpending'; id: number };

const SPENDING_FIELDS = ['initial_budget', 'adjusted_budget', 'amount', 'source'] as const;

// Capitoli e spesa per anno come in contabilità. Capitoli del perimetro che
// mancano = creati; per ogni capitolo del perimetro e anno coperto dal file la
// riga di spesa ha i valori della contabilità ("Spesa ragioneria" = spent,
// altrimenti il liquidato del capitolo nell'anno); righe di anni coperti che
// la contabilità non ha = cancellate. Gli anni fuori dal file non si toccano.
export function planChapters(
  acc: AccChapterRow[],
  scope: Set<string>,
  chapters: CurrentChapter[],
  spending: CurrentSpending[],
  liquidated: Map<string, number>,
): ChapterChange[] {
  const changes: ChapterChange[] = [];
  const byKey = new Map(chapters.map((c) => [chapterKey(c.chapter_code, c.article), c]));
  const inScope = acc.filter((row) => scope.has(chapterKey(row.chapter, row.article)));
  const coveredYears = new Set(acc.map((row) => row.year));

  const created = new Set<string>();
  for (const row of [...inScope].sort((a, b) => b.year - a.year)) {
    const key = chapterKey(row.chapter, row.article);
    if (byKey.has(key) || created.has(key)) continue;
    created.add(key);
    changes.push({
      kind: 'createChapter',
      chapter: row.chapter,
      article: row.article,
      description: row.description,
    });
  }

  const wanted = new Set<string>();
  for (const row of inScope) {
    const key = chapterKey(row.chapter, row.article);
    wanted.add(`${key}:${row.year}`);
    const values: SpendingValues = {
      initial_budget: row.initial_budget,
      adjusted_budget: row.adjusted_budget,
      amount: row.spent ?? liquidated.get(`${key}:${row.year}`) ?? null,
      source: RecordSource.ACCOUNTING,
    };
    const chapter = byKey.get(key);
    const current =
      chapter && spending.find((s) => s.budget_chapter_id_fk === chapter.id && s.year === row.year);
    if (!current) {
      changes.push({ kind: 'createSpending', chapterKey: key, year: row.year, values });
      continue;
    }
    const fields = SPENDING_FIELDS.filter((f) => !same(current[f], values[f])).map((f) => ({
      fieldName: f,
      oldValue: current[f],
      newValue: values[f],
    }));
    if (fields.length) changes.push({ kind: 'updateSpending', id: current.id, values, fields });
  }

  const keyById = new Map(chapters.map((c) => [c.id, chapterKey(c.chapter_code, c.article)]));
  for (const row of spending) {
    const key = keyById.get(row.budget_chapter_id_fk);
    if (!key || !scope.has(key) || !coveredYears.has(row.year)) continue;
    if (!wanted.has(`${key}:${row.year}`)) changes.push({ kind: 'deleteSpending', id: row.id });
  }
  return changes;
}

// Importi confrontati al centesimo (MySQL restituisce i decimal come stringhe).
function same(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined)
    return (a ?? null) === (b ?? null);
  if (typeof b === 'number') return Math.round(Number(a) * 100) === Math.round(b * 100);
  return a === b;
}
