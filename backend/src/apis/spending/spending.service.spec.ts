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
    expect(sql).toContain("(i.sdi_status IS NULL OR i.sdi_status <> 'REJECTED')");
    // Anno = competenza della riga; gli impegni non c'entrano.
    expect(sql).toMatch(/SELECT \(CASE\s+WHEN il\.period_start/);
    expect(sql).not.toContain('commitment');
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
    // Solo utenze in carico al Comune (attive e non volturate).
    expect(query.mock.calls[0][0]).toContain('u.supply_active = 1 AND u.transferred_to_third_party_id IS NULL');
    // Impegni del contratto dalla N-N: anche quelli condivisi con altri contratti.
    expect(query.mock.calls[1][0]).toContain('JOIN budget_commitment_contracts bcc ON bcc.commitment_id = bcm.id AND bcc.contract_id = ?');
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
    expect(query.mock.calls[2][0]).toContain('LEFT JOIN budget_chapters b ON b.id = ci.chapter_id');
    expect(query.mock.calls[2][0]).toContain('FROM invoice_commitment_shares');
    expect(query.mock.calls[2][0]).toContain('i.contratto_id_fk = ?');
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
    // Impegni contati una volta, anche se legati a più contratti.
    const commitmentsSql = String(query.mock.calls[1][0]);
    expect(commitmentsSql).not.toMatch(/JOIN (contracts|budget_commitment_contracts)/);
    expect(commitmentsSql).toContain('remaining');
    const linesSql = String(query.mock.calls[2][0]);
    expect(linesSql).toContain('ci.chapter_id = ?');
    expect(linesSql).toContain('FROM invoice_commitment_shares');
    expect(linesSql).toContain('SUM(ci.amount)');
    expect(query.mock.calls.every(([, p]) => (p as unknown[])[0] === 5)).toBe(true);
  });

  it('impegni del capitolo: numero, contratti, speso e rimanenza, esclusi i cancellati', async () => {
    query.mockResolvedValue([
      {
        id: 3,
        commitment_year: 2026,
        commitment_num: 514,
        commitment_sub: 2,
        fiscal_year: 2026,
        amount: '100.00',
        spent: '30.00',
        supplier: 'Fornitore prova',
        contract_ids: '10,11',
        fiscal_years: '[2027,2026]',
      },
      { id: 4, commitment_year: null, commitment_num: null, commitment_sub: null, fiscal_year: 2026, fiscal_years: [2026], amount: null, spent: '5', supplier: null, contract_ids: null },
    ]);
    expect(await service.chapterCommitments(5)).toEqual([
      {
        id: 3,
        label: '2026/514/2',
        fiscal_year: 2026,
        fiscal_years: [2026, 2027],
        amount: 100,
        spent: 30,
        remaining: 70,
        supplier: 'Fornitore prova',
        contract_ids: [10, 11],
      },
      { id: 4, label: '—', fiscal_year: 2026, fiscal_years: [2026], amount: null, spent: 5, remaining: null, supplier: null, contract_ids: [] },
    ]);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('bcm.deleted = 0');
    expect(sql).toContain('i.deleted = 0');
  });

  it('voci fattura del capitolo: quote e righe, importi numerici', async () => {
    query.mockResolvedValue([
      {
        share_id: 8,
        line_id: null,
        invoice_id: 2,
        number: 'F-1',
        invoice_date: '2026-03-01',
        supplier: null,
        utility_id: null,
        utility_code: null,
        year: '2026',
        amount: '12.50',
      },
      {
        share_id: null,
        line_id: 1,
        invoice_id: 3,
        number: 'F-2',
        invoice_date: '2026-02-01',
        supplier: 'Fornitore prova',
        utility_id: 4,
        utility_code: 'U4',
        year: 2026,
        amount: '7',
      },
    ]);
    const [share, line] = await service.chapterInvoiceLines(5);
    expect(share).toEqual({
      id: 8,
      kind: 'share',
      invoice_id: 2,
      number: 'F-1',
      invoice_date: '2026-03-01',
      supplier: null,
      utility_id: null,
      utility_code: null,
      year: 2026,
      amount: 12.5,
    });
    expect(line).toEqual(expect.objectContaining({ id: 1, kind: 'line', utility_id: 4, amount: 7 }));
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('FROM invoice_commitment_shares');
    expect(sql).toContain('ci.chapter_id = ?');
    expect(params).toEqual([5]);
  });

  describe('budgetCheck', () => {
    const chapterOk = (sql: string) =>
      sql.includes('FROM budget_chapters b') ? [{ chapter_code: '12332', article: 0, adjusted_budget: '100.00' }] : null;

    it('quote: capitolo dell’impegno, annualità della quota o la più vicina alla competenza; righe ignorate', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('WHERE bcm.id IN')) return [{ id: 3, chapter_id: 7, years: [2026, 2027] }];
        if (sql.includes('SUM(ci.amount)')) return [{ total: '90.00' }];
        return chapterOk(sql) ?? [];
      });
      const warnings = await service.budgetCheck({
        invoice_id: 44,
        invoice_date: '2025-12-31',
        lines: [{ utility_id_fk: 9, amount: 1000 }],
        commitment_shares: [
          { commitment_id_fk: 3, amount: 20 },
          { commitment_id_fk: 3, fiscal_year: 2027, amount: 5 },
        ],
      } as never);
      expect(warnings).toEqual([
        { budget_chapter_id: 7, chapter: '12332/0', year: 2026, invoiced: 110, adjusted_budget: 100 },
      ]);
      const sumCalls = query.mock.calls.filter(([s]) => String(s).includes('SUM(ci.amount)'));
      expect(sumCalls[0][0]).toContain('i.id <> ?');
      expect(sumCalls[0][0]).toContain('ci.chapter_id = ? AND ci.year = ?');
      expect(sumCalls.map(([, p]) => p)).toEqual([
        [7, 2026, 44],
        [7, 2027, 44],
      ]);
      expect(query.mock.calls.some(([s]) => String(s).includes('FROM utilities WHERE id IN'))).toBe(false);
    });

    it('quote senza annualità indicata: competenza della fattura dalle righe', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('WHERE bcm.id IN')) return [{ id: 3, chapter_id: 7, years: [2025, 2026] }];
        if (sql.includes('SUM(ci.amount)')) return [{ total: '0' }];
        return chapterOk(sql) ?? [];
      });
      await service.budgetCheck({
        invoice_date: '2026-02-01',
        lines: [
          { utility_id_fk: 9, amount: 5, period_start: '2025-11-01', period_end: '2025-12-31' },
          { utility_id_fk: 9, amount: 5, period_start: '2025-12-01', period_end: '2026-01-10' },
        ],
        commitment_shares: [{ commitment_id_fk: 3, fiscal_year: null, amount: 10 }],
      } as never);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(ci.amount)'));
      expect(sumCall[1]).toEqual([7, 2025, 0]);
    });

    it('senza quote: capitolo dell’utenza, esercizio = anno della fattura; sotto l’assestato nessun avviso', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: 7 }];
        if (sql.includes('SUM(ci.amount)')) return [{ total: '10.00' }];
        return chapterOk(sql) ?? [];
      });
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [{ utility_id_fk: 9, amount: 20 }],
          commitment_shares: [],
        } as never),
      ).toEqual([]);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(ci.amount)'));
      expect(sumCall[1]).toEqual([7, 2026, 0]);
      expect(query.mock.calls.some(([s]) => String(s).includes('WHERE bcm.id IN'))).toBe(false);
    });

    it('senza quote: esercizio = competenza del periodo della riga', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: 7 }];
        if (sql.includes('SUM(ci.amount)')) return [{ total: '0' }];
        return chapterOk(sql) ?? [];
      });
      await service.budgetCheck({
        invoice_date: '2026-02-01',
        lines: [{ utility_id_fk: 9, amount: 5, period_start: '2025-12-15', period_end: '2026-01-15' }],
      } as never);
      const sumCall = query.mock.calls.find(([s]) => String(s).includes('SUM(ci.amount)'));
      expect(sumCall[1]).toEqual([7, 2025, 0]);
    });

    it('ignora impegni e capitoli cancellati', async () => {
      query.mockResolvedValue([]);
      await service.budgetCheck({
        invoice_date: '2026-03-01',
        lines: [],
        commitment_shares: [{ commitment_id_fk: 3, amount: 5 }],
      } as never);
      const commitmentSql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('WHERE bcm.id IN'));
      expect(commitmentSql).toContain('deleted = 0');
      query.mockImplementation(async (sql: string) =>
        sql.includes('FROM utilities WHERE id IN') ? [{ id: 9, chapter_id: 7 }] : [],
      );
      await service.budgetCheck({
        invoice_date: '2026-03-01',
        lines: [{ utility_id_fk: 9, amount: 5 }],
      } as never);
      const chapterSql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM budget_chapters b'));
      expect(chapterSql).toContain('b.deleted = 0');
    });

    it('nessun avviso senza assestato, senza capitolo o senza utenza', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM utilities WHERE id IN')) return [{ id: 9, chapter_id: null }, { id: 8, chapter_id: 7 }];
        if (sql.includes('FROM budget_chapters b')) return [{ chapter_code: '1', article: 0, adjusted_budget: null }];
        return [];
      });
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [
            { utility_id_fk: null, amount: 5 },
            { utility_id_fk: 9, amount: 5 },
            { utility_id_fk: 8, amount: 5 },
          ],
        } as never),
      ).toEqual([]);
    });
  });
});
