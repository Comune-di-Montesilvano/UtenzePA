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

  it('scheda capitolo: anni da bilancio, impegni e fatture del capitolo (capitolo dall’impegno o dall’utenza)', async () => {
    query
      .mockResolvedValueOnce([
        { id: 1, year: 2024, amount: '100', initial_budget: null, adjusted_budget: null, notes: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const rows = await service.forChapter(5);
    expect(rows.map((r) => r.year)).toEqual([new Date().getFullYear(), 2024]);
    const linesSql = String(query.mock.calls[2][0]);
    expect(linesSql).toContain('COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk) = ?');
    expect(linesSql).toContain('COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))');
    expect(query.mock.calls.every(([, p]) => (p as unknown[])[0] === 5)).toBe(true);
  });

  it('impegni del capitolo con contratto e fornitore, esclusi impegni e contratti cancellati', async () => {
    query.mockResolvedValue([
      {
        id: 3,
        contract_id: 10,
        fiscal_year: 2026,
        commitment_number: null,
        amount: null,
        cig_contract: 'X',
        supplier: 'Fornitore prova',
      },
    ]);
    expect(await service.chapterCommitments(5)).toEqual([
      {
        id: 3,
        contract_id: 10,
        fiscal_year: 2026,
        commitment_number: null,
        amount: null,
        cig_contract: 'X',
        supplier: 'Fornitore prova',
      },
    ]);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('bcm.deleted = 0');
    expect(sql).toContain('c.deleted = 0');
  });

  it('righe fattura del capitolo, importi numerici', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        invoice_id: 2,
        number: 'F-1',
        invoice_date: '2026-03-01',
        supplier: null,
        utility_id: 4,
        utility_code: 'U4',
        year: '2026',
        amount: '12.50',
      },
    ]);
    const [line] = await service.chapterInvoiceLines(5);
    expect(line).toEqual(expect.objectContaining({ year: 2026, amount: 12.5, invoice_id: 2 }));
  });

  describe('budgetCheck', () => {
    it('riga con impegno: capitolo ed esercizio dell’impegno; avviso oltre l’assestato, fattura stessa esclusa', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM budget_commitments WHERE id IN')) return [{ id: 3, chapter_id: 7, fiscal_year: 2026 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '12332', article: 0, adjusted_budget: '100.00' }];
        if (sql.includes('SUM(il.amount)')) return [{ total: '90.00' }];
        return [];
      });
      const warnings = await service.budgetCheck({
        invoice_id: 44,
        invoice_date: '2025-12-31',
        lines: [{ utility_id_fk: null, commitment_id_fk: 3, amount: 20 }],
      } as never);
      expect(warnings).toEqual([
        { budget_chapter_id: 7, chapter: '12332/0', year: 2026, invoiced: 110, adjusted_budget: 100 },
      ]);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(il.amount)'));
      expect(sumCall[0]).toContain('i.id <> ?');
      expect(sumCall[1]).toEqual([7, 2026, 44]);
    });

    it('riga senza impegno: capitolo dell’utenza, esercizio = anno della fattura; sotto l’assestato nessun avviso', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: 7 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '12332', article: 0, adjusted_budget: '100.00' }];
        if (sql.includes('SUM(il.amount)')) return [{ total: '10.00' }];
        return [];
      });
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [{ utility_id_fk: 9, commitment_id_fk: null, amount: 20 }],
        } as never),
      ).toEqual([]);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(il.amount)'));
      expect(sumCall[1]).toEqual([7, 2026, 0]);
    });

    it('nessun avviso senza assestato, senza capitolo o senza utenza né impegno', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: null }, { id: 8, chapter_id: 7 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '1', article: 0, adjusted_budget: null }];
        return [];
      });
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [
            { utility_id_fk: null, commitment_id_fk: null, amount: 5 },
            { utility_id_fk: 9, commitment_id_fk: null, amount: 5 },
            { utility_id_fk: 8, commitment_id_fk: null, amount: 5 },
          ],
        } as never),
      ).toEqual([]);
    });
  });
});
