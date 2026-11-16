import { SpendingService } from './spending.service';
import * as items from './chapter-items.sql';
import * as q from './spending.queries';

// Letture simulate per nome: le query vere (fatture escluse, impegni contati una
// volta, utenze in carico, voci di capitolo) sono provate in spending.int-spec.ts.
jest.mock('./chapter-items.sql');
jest.mock('./spending.queries');
const mq = jest.mocked(q);
const mi = jest.mocked(items);

describe('SpendingService', () => {
  let service: SpendingService;
  const m = {};

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SpendingService({ manager: m } as never);
  });

  it('spesa per utenza per anno, numeri convertiti', async () => {
    mq.utilityYears.mockResolvedValue([
      { year: 2026, total: '30.50', invoices: '2' },
      { year: '2025', total: '10.00', invoices: 1 },
    ]);
    expect(await service.forUtility(3)).toEqual([
      { year: 2026, total: 30.5, invoices: 2 },
      { year: 2025, total: 10, invoices: 1 },
    ]);
    expect(mq.utilityYears).toHaveBeenCalledWith(m, 3);
  });

  it('spesa per immobile con conteggio utenze condivise con altri immobili', async () => {
    mq.assetYears.mockResolvedValue([{ year: 2026, total: '5', invoices: '1' }]);
    mq.sharedUtilities.mockResolvedValue(2);
    expect(await service.forAsset(8)).toEqual({
      years: [{ year: 2026, total: 5, invoices: 1 }],
      shared_utilities: 2,
    });
  });

  describe('riepilogo capitoli del contratto', () => {
    beforeEach(() => {
      mq.contractUtilityChapters.mockResolvedValue([]);
      mq.contractCommitments.mockResolvedValue([]);
      mi.contractSpent.mockResolvedValue([]);
    });

    it('unisce utenze, impegni e speso per capitolo', async () => {
      mq.contractUtilityChapters.mockResolvedValue([
        {
          budget_chapter_id: 7,
          chapter_code: '11428',
          article: 0,
          description: 'Acqua',
          utilities: '12',
        },
        {
          budget_chapter_id: null,
          chapter_code: null,
          article: null,
          description: null,
          utilities: '3',
        },
      ]);
      mq.contractCommitments.mockResolvedValue([
        { id: 4, budget_chapter_id: 7, fiscal_year: 2026, amount: null },
      ]);
      mi.contractSpent.mockResolvedValue([{ budget_chapter_id: 7, year: 2026, total: '99.90' }]);
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
        expect.objectContaining({
          budget_chapter_id: null,
          utilities: 3,
          committed: [],
          spent: [],
        }),
      );
    });

    it('un capitolo impegnato senza utenze compare con 0 utenze', async () => {
      mq.contractCommitments.mockResolvedValue([
        {
          id: 4,
          budget_chapter_id: 9,
          fiscal_year: 2026,
          amount: '100',
          chapter_code: '12193',
          article: 0,
          description: 'Gas',
        },
      ]);
      expect(await service.chaptersSummary(1)).toEqual([
        expect.objectContaining({
          budget_chapter_id: 9,
          chapter_code: '12193',
          utilities: 0,
          committed: [{ year: 2026, amount: 100, commitment_id: 4 }],
        }),
      ]);
    });

    it('capitolo con sola spesa ha codice e descrizione', async () => {
      mi.contractSpent.mockResolvedValue([
        {
          budget_chapter_id: 9,
          chapter_code: '12193',
          article: 0,
          description: 'Gas',
          year: 2026,
          total: '5',
        },
      ]);
      expect(await service.chaptersSummary(1)).toEqual([
        expect.objectContaining({
          budget_chapter_id: 9,
          chapter_code: '12193',
          description: 'Gas',
          spent: [{ year: 2026, total: 5 }],
        }),
      ]);
    });
  });

  it('scheda capitolo: anni da bilancio, impegni e fatture, più l’esercizio in corso', async () => {
    mq.chapterBudgets.mockResolvedValue([
      {
        id: 1,
        year: 2024,
        amount: '100',
        initial_budget: null,
        adjusted_budget: null,
        notes: null,
      },
    ]);
    mq.chapterCommitted.mockResolvedValue([]);
    mi.chapterInvoiced.mockResolvedValue([]);
    const rows = await service.forChapter(5);
    expect(rows.map((r) => r.year)).toEqual([new Date().getFullYear(), 2024]);
    for (const read of [mq.chapterBudgets, mq.chapterCommitted, mi.chapterInvoiced])
      expect(read).toHaveBeenCalledWith(m, 5);
  });

  it('impegni del capitolo: numero, contratti, speso e rimanenza', async () => {
    mq.chapterCommitments.mockResolvedValue([
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
      {
        id: 4,
        commitment_year: null,
        commitment_num: null,
        commitment_sub: null,
        fiscal_year: 2026,
        fiscal_years: [2026],
        amount: null,
        spent: '5',
        supplier: null,
        contract_ids: null,
      },
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
      {
        id: 4,
        label: '—',
        fiscal_year: 2026,
        fiscal_years: [2026],
        amount: null,
        spent: 5,
        remaining: null,
        supplier: null,
        contract_ids: [],
      },
    ]);
  });

  it('voci fattura del capitolo: quote e righe, importi numerici', async () => {
    mi.chapterItems.mockResolvedValue([
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
    expect(line).toEqual(
      expect.objectContaining({ id: 1, kind: 'line', utility_id: 4, amount: 7 }),
    );
  });

  describe('budgetCheck', () => {
    beforeEach(() => {
      mq.commitmentChapters.mockResolvedValue([]);
      mq.utilityChapters.mockResolvedValue([]);
      mq.chapterBudget.mockResolvedValue({
        chapter_code: '12332',
        article: 0,
        adjusted_budget: '100.00',
      });
      mi.chapterYearInvoiced.mockResolvedValue(0);
    });

    it('quote: capitolo dell’impegno, annualità della quota o la più vicina alla competenza; righe ignorate', async () => {
      mq.commitmentChapters.mockResolvedValue([{ id: 3, chapter_id: 7, years: [2026, 2027] }]);
      mi.chapterYearInvoiced.mockResolvedValue(90);
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
        {
          budget_chapter_id: 7,
          chapter: '12332/0',
          year: 2026,
          invoiced: 110,
          adjusted_budget: 100,
        },
      ]);
      expect(mi.chapterYearInvoiced.mock.calls.map((c) => c.slice(1))).toEqual([
        [7, 2026, 44],
        [7, 2027, 44],
      ]);
      expect(mq.utilityChapters).not.toHaveBeenCalled();
    });

    it('quote senza annualità indicata: competenza della fattura dalle righe', async () => {
      mq.commitmentChapters.mockResolvedValue([{ id: 3, chapter_id: 7, years: [2025, 2026] }]);
      await service.budgetCheck({
        invoice_date: '2026-02-01',
        lines: [
          { utility_id_fk: 9, amount: 5, period_start: '2025-11-01', period_end: '2025-12-31' },
          { utility_id_fk: 9, amount: 5, period_start: '2025-12-01', period_end: '2026-01-10' },
        ],
        commitment_shares: [{ commitment_id_fk: 3, fiscal_year: null, amount: 10 }],
      } as never);
      expect(mi.chapterYearInvoiced).toHaveBeenCalledWith(m, 7, 2025, 0);
    });

    it('senza quote: capitolo dell’utenza, esercizio = anno della fattura; sotto l’assestato nessun avviso', async () => {
      mq.utilityChapters.mockResolvedValue([{ id: 9, chapter_id: 7 }]);
      mi.chapterYearInvoiced.mockResolvedValue(10);
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [{ utility_id_fk: 9, amount: 20 }],
          commitment_shares: [],
        } as never),
      ).toEqual([]);
      expect(mi.chapterYearInvoiced).toHaveBeenCalledWith(m, 7, 2026, 0);
      expect(mq.commitmentChapters).not.toHaveBeenCalled();
    });

    it('senza quote: esercizio = competenza del periodo della riga', async () => {
      mq.utilityChapters.mockResolvedValue([{ id: 9, chapter_id: 7 }]);
      await service.budgetCheck({
        invoice_date: '2026-02-01',
        lines: [
          { utility_id_fk: 9, amount: 5, period_start: '2025-12-15', period_end: '2026-01-15' },
        ],
      } as never);
      expect(mi.chapterYearInvoiced).toHaveBeenCalledWith(m, 7, 2025, 0);
    });

    it('nessun avviso senza assestato, senza capitolo o senza utenza', async () => {
      mq.utilityChapters.mockResolvedValue([
        { id: 9, chapter_id: null },
        { id: 8, chapter_id: 7 },
      ]);
      mq.chapterBudget.mockResolvedValue({ chapter_code: '1', article: 0, adjusted_budget: null });
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
      expect(mi.chapterYearInvoiced).not.toHaveBeenCalled();
    });

    it('capitolo cancellato o inesistente: nessun avviso', async () => {
      mq.utilityChapters.mockResolvedValue([{ id: 9, chapter_id: 7 }]);
      mq.chapterBudget.mockResolvedValue(undefined);
      expect(
        await service.budgetCheck({
          invoice_date: '2026-03-01',
          lines: [{ utility_id_fk: 9, amount: 500 }],
        } as never),
      ).toEqual([]);
    });
  });
});
