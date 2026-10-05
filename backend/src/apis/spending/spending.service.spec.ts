import { SpendingService } from './spending.service';

describe('SpendingService', () => {
  let query: jest.Mock;
  let service: SpendingService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new SpendingService({ query } as never);
  });

  it('spesa per utenza per anno, numeri convertiti, solo fatture non cancellate', async () => {
    query.mockResolvedValue([
      { year: 2026, total: '30.50', invoices: '2' },
      { year: '2025', total: '10.00', invoices: 1 },
    ]);
    expect(await service.forUtility(3)).toEqual([
      { year: 2026, total: 30.5, invoices: 2 },
      { year: 2025, total: 10, invoices: 1 },
    ]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))');
    expect(params).toEqual([3]);
  });

  it('spesa per immobile con conteggio utenze condivise con altri immobili', async () => {
    query
      .mockResolvedValueOnce([{ year: 2026, total: '5', invoices: '1' }])
      .mockResolvedValueOnce([{ shared: '2' }]);
    expect(await service.forAsset(8)).toEqual({
      years: [{ year: 2026, total: 5, invoices: 1 }],
      shared_utilities: 2,
    });
    expect(query.mock.calls[0][0]).toContain('utility_assets');
  });

  it('riepilogo capitoli: unisce utenze, impegni e speso per capitolo', async () => {
    query
      .mockResolvedValueOnce([
        { budget_chapter_id: 7, chapter_code: '11428', article: 0, description: 'Acqua', utilities: '12' },
        { budget_chapter_id: null, chapter_code: null, article: null, description: null, utilities: '3' },
      ])
      .mockResolvedValueOnce([{ id: 4, budget_chapter_id: 7, fiscal_year: 2026, amount: null }])
      .mockResolvedValueOnce([{ budget_chapter_id: 7, year: 2026, total: '99.90' }]);
    const rows = await service.chaptersSummary(1);
    expect(rows[0]).toEqual({
      budget_chapter_id: 7,
      chapter_code: '11428',
      article: 0,
      description: 'Acqua',
      utilities: 12,
      committed: [{ year: 2026, amount: null, commitment_id: 4 }],
      spent: [{ year: 2026, total: 99.9 }],
    });
    expect(rows[1]).toEqual(
      expect.objectContaining({ budget_chapter_id: null, utilities: 3, committed: [], spent: [] }),
    );
  });

  it('riepilogo capitoli: un capitolo impegnato senza utenze compare con 0 utenze', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 4,
          budget_chapter_id: 9,
          fiscal_year: 2026,
          amount: '100',
          chapter_code: '12193',
          article: 0,
          description: 'Gas',
        },
      ])
      .mockResolvedValueOnce([]);
    const rows = await service.chaptersSummary(1);
    expect(rows).toEqual([
      expect.objectContaining({
        budget_chapter_id: 9,
        chapter_code: '12193',
        utilities: 0,
        committed: [{ year: 2026, amount: 100, commitment_id: 4 }],
      }),
    ]);
  });

  it('riepilogo capitoli: capitolo con sola spesa ha codice e descrizione', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { budget_chapter_id: 9, chapter_code: '12193', article: 0, description: 'Gas', year: 2026, total: '5' },
      ]);
    const rows = await service.chaptersSummary(1);
    expect(rows).toEqual([
      expect.objectContaining({ budget_chapter_id: 9, chapter_code: '12193', description: 'Gas', spent: [{ year: 2026, total: 5 }] }),
    ]);
    expect(query.mock.calls[2][0]).toContain('LEFT JOIN budget_chapters');
  });
});
