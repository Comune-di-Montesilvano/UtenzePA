import type { AccChapterRow } from './accounting-csv';
import { planChapters, type CurrentSpending } from './chapter-plan';
import { RecordSource } from './record-source.enum';

const acc = (year: number, chapter: string, patch: Partial<AccChapterRow> = {}): AccChapterRow => ({
  year,
  chapter,
  article: 0,
  description: `CAP ${chapter}`,
  initial_budget: 1000,
  adjusted_budget: 1200,
  spent: null,
  ...patch,
});

const spending = (
  id: number,
  chapterId: number,
  year: number,
  patch: Partial<CurrentSpending> = {},
): CurrentSpending => ({
  id,
  budget_chapter_id_fk: chapterId,
  year,
  initial_budget: 1000,
  adjusted_budget: 1200,
  amount: null,
  source: RecordSource.ACCOUNTING,
  ...patch,
});

const chapter7 = { id: 7, chapter_code: '100', article: 0 };

describe('planChapters', () => {
  it('capitolo del perimetro assente in UtenzePA = createChapter con la descrizione', () => {
    const changes = planChapters([acc(2026, '200')], new Set(['200/0']), [], [], new Map());
    expect(changes).toContainEqual({
      kind: 'createChapter',
      chapter: '200',
      article: 0,
      description: 'CAP 200',
    });
  });

  it('capitolo fuori perimetro ignorato', () => {
    expect(planChapters([acc(2026, '300')], new Set(['100/0']), [chapter7], [], new Map())).toEqual(
      [],
    );
  });

  it('anno coperto senza riga = createSpending con source ACCOUNTING', () => {
    const changes = planChapters([acc(2026, '100')], new Set(['100/0']), [chapter7], [], new Map());
    expect(changes).toEqual([
      {
        kind: 'createSpending',
        chapterKey: '100/0',
        year: 2026,
        values: {
          initial_budget: 1000,
          adjusted_budget: 1200,
          amount: null,
          source: RecordSource.ACCOUNTING,
        },
      },
    ]);
  });

  it('riga MANUAL in anno coperto diventa ACCOUNTING con i campi cambiati', () => {
    const current = [spending(5, 7, 2026, { adjusted_budget: 900, source: RecordSource.MANUAL })];
    const changes = planChapters(
      [acc(2026, '100')],
      new Set(['100/0']),
      [chapter7],
      current,
      new Map(),
    );
    expect(changes).toEqual([
      {
        kind: 'updateSpending',
        id: 5,
        values: {
          initial_budget: 1000,
          adjusted_budget: 1200,
          amount: null,
          source: RecordSource.ACCOUNTING,
        },
        fields: [
          { fieldName: 'adjusted_budget', oldValue: 900, newValue: 1200 },
          { fieldName: 'source', oldValue: RecordSource.MANUAL, newValue: RecordSource.ACCOUNTING },
        ],
      },
    ]);
  });

  it('riga in anno coperto per un capitolo che il file non ha in quell anno = deleteSpending', () => {
    const current = [spending(5, 7, 2026), spending(6, 7, 2025, { source: RecordSource.MANUAL })];
    const changes = planChapters(
      [acc(2026, '100'), acc(2025, '200')],
      new Set(['100/0']),
      [chapter7],
      current,
      new Map(),
    );
    expect(changes).toEqual([{ kind: 'deleteSpending', id: 6 }]);
  });

  it('riga di un anno non coperto non toccata', () => {
    const current = [
      spending(5, 7, 2026),
      spending(6, 7, 2024, { source: RecordSource.MANUAL, amount: 50 }),
    ];
    expect(
      planChapters([acc(2026, '100')], new Set(['100/0']), [chapter7], current, new Map()),
    ).toEqual([]);
  });

  it('spent vuoto = somma delle liquidazioni del capitolo e anno', () => {
    const changes = planChapters(
      [acc(2026, '100')],
      new Set(['100/0']),
      [chapter7],
      [],
      new Map([['100/0:2026', 6378.97]]),
    );
    expect(changes[0]).toEqual(
      expect.objectContaining({ values: expect.objectContaining({ amount: 6378.97 }) }),
    );
  });

  it('spent valorizzato vince sulle liquidazioni', () => {
    const changes = planChapters(
      [acc(2026, '100', { spent: 10 })],
      new Set(['100/0']),
      [chapter7],
      [],
      new Map([['100/0:2026', 6378.97]]),
    );
    expect(changes[0]).toEqual(
      expect.objectContaining({ values: expect.objectContaining({ amount: 10 }) }),
    );
  });

  it('ricarico identico = nessuna modifica', () => {
    const current = [spending(5, 7, 2026, { amount: 30 })];
    expect(
      planChapters(
        [acc(2026, '100')],
        new Set(['100/0']),
        [chapter7],
        current,
        new Map([['100/0:2026', 30]]),
      ),
    ).toEqual([]);
  });
});
