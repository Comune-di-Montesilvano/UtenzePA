import { buildChapterYear, chaptersYearSummary, mergeChapterYears } from './chapter-year';
import * as items from './chapter-items.sql';
import * as q from './spending.queries';

// Letture simulate per nome: le query vere (voci di capitolo, impegnato, esercizi
// cancellati, fatture escluse) sono provate in spending.int-spec.ts.
jest.mock('./chapter-items.sql');
jest.mock('./spending.queries');
const mq = jest.mocked(q);
const mi = jest.mocked(items);
const m = {} as never;

describe('chapter-year', () => {
  it('anno completo: disponibile = assestato − impegnato, numeri convertiti', () => {
    const y = buildChapterYear(
      2026,
      {
        id: 7,
        initial_budget: '30000.00',
        adjusted_budget: '28000.00',
        amount: null,
        notes: null,
        source: 'ACCOUNTING',
      },
      { commitments: '2', total: '26076.68', without_amount: '0', remaining: '4955.88' },
      { total: '21120.80', invoices: '12' },
    );
    expect(y).toEqual({
      year: 2026,
      spending_id: 7,
      spending_source: 'ACCOUNTING',
      initial_budget: 30000,
      adjusted_budget: 28000,
      recorded_spending: null,
      notes: null,
      committed: 26076.68,
      commitments: 2,
      commitments_without_amount: 0,
      remaining: 4955.88,
      invoiced: 21120.8,
      invoices: 12,
      available: 1923.32,
      over_budget: false,
    });
  });

  it('impegni senza importo: impegnato 0 e conteggio di quelli senza importo', () => {
    const y = buildChapterYear(
      2026,
      undefined,
      { commitments: '2', total: null, without_amount: '2' },
      undefined,
    );
    expect(y).toEqual(
      expect.objectContaining({
        committed: 0,
        commitments: 2,
        commitments_without_amount: 2,
        available: null,
        remaining: null,
      }),
    );
  });

  it('oltre l’assestato se impegnato o fatturato lo superano', () => {
    expect(
      buildChapterYear(2026, { adjusted_budget: '100' }, { total: '150' }, undefined).over_budget,
    ).toBe(true);
    expect(
      buildChapterYear(2026, { adjusted_budget: '100' }, undefined, { total: '100.01' })
        .over_budget,
    ).toBe(true);
    expect(
      buildChapterYear(2026, { adjusted_budget: '100' }, { total: '100' }, { total: '100' })
        .over_budget,
    ).toBe(false);
    expect(buildChapterYear(2026, undefined, { total: '999' }, undefined).over_budget).toBe(false);
  });

  it('unione per anno: tutti gli anni presenti più l’esercizio in corso, dal più recente', () => {
    const rows = mergeChapterYears(
      [{ id: 1, year: 2023, amount: '10' }],
      [{ year: 2025, commitments: '1', total: null, without_amount: '1' }],
      [{ year: '2024', total: '5', invoices: '1' }],
      2026,
    );
    expect(rows.map((r) => r.year)).toEqual([2026, 2025, 2024, 2023]);
    expect(rows[3].recorded_spending).toBe(10);
  });

  it('riepilogo dell’esercizio per capitolo: tre letture sull’anno, unione per capitolo', async () => {
    mq.yearBudgets.mockResolvedValue([{ chapter_id: 4, id: 9, adjusted_budget: '50' }]);
    mq.yearCommitted.mockResolvedValue([
      { chapter_id: 6, commitments: '1', total: '10', without_amount: '0' },
    ]);
    mi.yearInvoiced.mockResolvedValue([{ chapter_id: 4, total: '60', invoices: '2' }]);
    const rows = await chaptersYearSummary(m, 2026);
    expect(rows.map((r) => [r.budget_chapter_id, r.over_budget])).toEqual([
      [4, true],
      [6, false],
    ]);
    expect(mq.yearBudgets).toHaveBeenCalledWith(m, 2026);
    expect(mq.yearCommitted).toHaveBeenCalledWith(m, 2026);
    expect(mi.yearInvoiced).toHaveBeenCalledWith(m, 2026);
  });

  it('impegno da 1000 su 3 contratti: impegnato 1000, contato una volta', async () => {
    mq.yearBudgets.mockResolvedValue([]);
    mq.yearCommitted.mockResolvedValue([
      {
        chapter_id: 4,
        commitments: '1',
        total: '1000.00',
        without_amount: '0',
        remaining: '400',
      },
    ]);
    mi.yearInvoiced.mockResolvedValue([]);
    const [row] = await chaptersYearSummary(m, 2026);
    expect(row).toEqual(
      expect.objectContaining({ committed: 1000, commitments: 1, remaining: 400 }),
    );
  });
});
