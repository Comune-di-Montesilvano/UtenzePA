import { ELEVATOR_INSPECTION_KIND } from '@apis/plants/plant.calc';
import * as chapterYear from '@apis/spending/chapter-year';
import { CostStatus } from '@apis/utility/cost-status';
import * as unknown from '@apis/invoice-import/pattern/unknown-structures.sql';
import * as q from './anomalies.queries';
import * as sql from './anomalies.sql';
import { AnomaliesService } from './anomalies.service';

// Logica in Node delle anomalie (conversioni, giorni di attesa, raggruppamenti,
// soglie di tempo, ambiente) con le letture simulate per nome. Le query vere,
// categoria per categoria, sono provate in anomalies.int-spec.ts.
jest.mock('./anomalies.queries');
jest.mock('./anomalies.sql');
jest.mock('@apis/invoice-import/pattern/unknown-structures.sql');
jest.mock('@apis/spending/chapter-year', () => ({
  ...jest.requireActual('@apis/spending/chapter-year'),
  chaptersYearSummary: jest.fn(),
}));
const mq = jest.mocked(q);
const ms = jest.mocked(sql);
const summary = jest.mocked(chapterYear.chaptersYearSummary);

type Row = Record<string, unknown>;
const NOW = new Date('2026-10-19T12:00:00Z');

describe('AnomaliesService', () => {
  let service: AnomaliesService;
  const env = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    for (const fn of Object.values(mq))
      if (jest.isMockFunction(fn)) (fn as jest.Mock).mockResolvedValue([]);
    mq.invoiceImportState.mockResolvedValue(undefined);
    mq.accountingImportState.mockResolvedValue(undefined);
    ms.liquidationsUnmatched.mockResolvedValue([]);
    ms.utilityChapterAmbiguous.mockResolvedValue([]);
    jest.mocked(unknown.unknownStructures).mockResolvedValue([]);
    summary.mockResolvedValue([]);
    service = new AnomaliesService({ manager: {} } as never);
    service.now = () => NOW;
    service.inboxPresent = () => true;
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  const run = () => service.getAnomalies();

  it('numeri e liste convertiti: contratti senza CIG e CIG duplicati', async () => {
    mq.contractsWithoutCig.mockResolvedValue([
      { id: '7', supplier: 'ENGIE', agreement: null, supply_expiry_date: null, utilities: '125' },
    ]);
    mq.duplicateCigs.mockResolvedValue([{ cig: 'ABC', contracts: '3,4' }]);
    const a = await run();
    expect(a.contracts_without_cig).toEqual({
      count: 1,
      items: [
        { id: 7, supplier: 'ENGIE', agreement: null, supply_expiry_date: null, utilities: 125 },
      ],
    });
    expect(a.duplicate_cigs.items).toEqual([{ cig: 'ABC', contracts: [3, 4] }]);
  });

  it('a carico: stato e giorno di oggi passati alle letture, giorni di attesa da pending_since', async () => {
    mq.utilitiesByCostStatus.mockImplementation(async (_m, status) =>
      status === CostStatus.TO_TRANSFER
        ? [
            {
              id: '4',
              utility_id: 'IT004',
              type: 'Luce',
              pending_since: '2026-10-09',
              contracts: 'Delta',
            },
          ]
        : status === CostStatus.TO_DECIDE
          ? [{ id: 5, utility_id: 'IT005', type: 'Gas', pending_since: null, contracts: null }]
          : [],
    );
    const a = await run();
    expect(mq.utilitiesByCostStatus.mock.calls.map(([, s, d]) => [s, d])).toEqual([
      [CostStatus.TO_TRANSFER, '2026-10-19'],
      [CostStatus.TO_RECOVER, '2026-10-19'],
      [CostStatus.TO_DECIDE, '2026-10-19'],
    ]);
    expect(a.utilities_to_transfer.items).toEqual([
      { id: 4, utility_id: 'IT004', type: 'Luce', contracts: 'Delta', pending_days: 10 },
    ]);
    expect(a.utilities_to_decide.items).toEqual([
      { id: 5, utility_id: 'IT005', type: 'Gas', contracts: null, pending_days: 0 },
    ]);
  });

  it('attivazioni in sospeso: una per utenza, la più vecchia; senza richiesta = giorno di inserimento', async () => {
    mq.pendingSupplyEvents.mockResolvedValue([
      {
        utility_pk: 1,
        utility_id: 'A',
        type: 'Luce',
        event_type: 'ACTIVATION',
        requested_on: '2026-10-14',
        create_date: null,
      },
      {
        utility_pk: 1,
        utility_id: 'A',
        type: 'Luce',
        event_type: 'ACTIVATION',
        requested_on: '2026-10-09',
        create_date: null,
      },
      {
        utility_pk: 2,
        utility_id: 'B',
        type: 'Luce',
        event_type: 'ACTIVATION',
        requested_on: null,
        create_date: new Date('2026-10-16T22:30:00Z'),
      },
      {
        utility_pk: 3,
        utility_id: 'C',
        type: 'Luce',
        event_type: 'CESSATION',
        requested_on: '2026-10-18',
        create_date: null,
      },
    ] as Row[]);
    const a = await run();
    expect(a.pending_activations.items).toEqual([
      { id: 1, utility_id: 'A', type: 'Luce', pending_days: 10 },
      { id: 2, utility_id: 'B', type: 'Luce', pending_days: 2 },
    ]);
    expect(a.pending_cessations.items).toEqual([
      { id: 3, utility_id: 'C', type: 'Luce', pending_days: 1 },
    ]);
  });

  it('fatture fuori periodo: storico letto per le sole utenze delle righe, filtro in Node', async () => {
    const line = (invoice: number, end: string) => ({
      invoice_id: invoice,
      number: `F${invoice}`,
      invoice_date: '2026-09-30',
      utility_id: 9,
      utility_code: 'IT009',
      period_start: '2026-08-01',
      period_end: end,
    });
    mq.recentUtilityLines.mockResolvedValue([
      line(1, '2026-08-31'),
      line(2, '2026-09-30'),
      line(2, '2026-09-30'),
    ]);
    mq.supplyEvents.mockResolvedValue([
      {
        id: 1,
        utility_id_fk: 9,
        type: 'CESSATION',
        effective_on: '2026-07-01',
        date_unknown: 0,
        deleted: 0,
        create_date: '2026-07-01',
      },
    ]);
    const a = await run();
    expect(mq.recentUtilityLines).toHaveBeenCalledWith(expect.anything(), '2026-10-19');
    expect(mq.supplyEvents).toHaveBeenCalledWith(expect.anything(), [9]);
    expect(a.invoices_outside_supply_periods.items).toEqual([
      expect.objectContaining({ invoice_id: 1, period: '01/08/2026–31/08/2026' }),
      expect.objectContaining({ invoice_id: 2, period: '01/08/2026–30/09/2026' }),
    ]);
  });

  it('nessuna riga fattura: nessuna lettura dello storico', async () => {
    await run();
    expect(mq.supplyEvents).not.toHaveBeenCalled();
  });

  it('impegni: sforati solo nell’esercizio, pluriennale senza contratto una volta, senza importo', async () => {
    const year = new Date().getFullYear();
    const row = (
      id: number,
      fiscal_year: number,
      amount: string | null,
      spent: string,
      contracts = '1',
    ) => ({
      id,
      commitment_year: 2026,
      commitment_num: id,
      commitment_sub: 1,
      fiscal_year,
      amount,
      chapter: '100/1',
      contracts,
      spent,
    });
    mq.commitmentsCheck.mockResolvedValue([
      row(1, year, '100.00', '100.01'),
      row(1, year + 1, '50.00', '80.00'),
      row(2, year, '10.00', '0', '0'),
      row(2, year + 1, '10.00', '0', '0'),
      row(3, year, null, '5'),
    ]);
    const a = await run();
    expect(mq.commitmentsCheck).toHaveBeenCalledWith(expect.anything(), year);
    expect(a.commitments_overspent.items).toEqual([
      {
        id: 1,
        label: '2026/1/1',
        chapter: '100/1',
        fiscal_year: year,
        amount: 100,
        remaining: -0.01,
      },
    ]);
    expect(a.commitments_without_contract.items.map((c) => [c.id, c.fiscal_year])).toEqual([
      [2, year],
    ]);
    expect(a.commitments_without_amount.items).toEqual([
      expect.objectContaining({ id: 3, amount: null, remaining: null }),
    ]);
  });

  it('fatture senza quota: AMBIGUOUS se il contratto ha l’annualità della competenza', async () => {
    mq.invoicesWithoutCommitment.mockResolvedValue([
      {
        id: 1,
        number: 'A',
        date: '2025-05-01',
        contract_id: 3,
        amount: '50.00',
        period_start: null,
        period_end: null,
        years: '2024,2025',
      },
      {
        id: 2,
        number: 'B',
        date: '2025-01-10',
        contract_id: 3,
        amount: '30',
        period_start: '2024-11-01',
        period_end: '2024-12-31',
        years: '2025',
      },
      {
        id: 3,
        number: 'C',
        date: '2025-01-10',
        contract_id: 4,
        amount: '-5',
        period_start: null,
        period_end: null,
        years: null,
      },
    ]);
    expect((await run()).invoices_without_commitment.items).toEqual([
      { id: 1, number: 'A', date: '2025-05-01', contract_id: 3, amount: 50, reason: 'AMBIGUOUS' },
      {
        id: 2,
        number: 'B',
        date: '2025-01-10',
        contract_id: 3,
        amount: 30,
        reason: 'NO_COMMITMENTS',
      },
      {
        id: 3,
        number: 'C',
        date: '2025-01-10',
        contract_id: 4,
        amount: -5,
        reason: 'NO_COMMITMENTS',
      },
    ]);
  });

  describe('import fatture fermo', () => {
    const state = (lastSuccess: string | null, enabled = 1) => ({
      enabled,
      last_run_at: new Date('2026-10-19T11:45:00Z'),
      last_success_at: lastSuccess ? new Date(lastSuccess) : null,
      last_error: 'connessione persa',
    });
    beforeEach(() => {
      Object.assign(process.env, {
        PEC_IMAP_HOST: 'imap.example.invalid',
        PEC_IMAP_USER: 'u',
        PEC_IMAP_PASSWORD: 'p',
      });
      delete process.env.INVOICE_IMPORT_DISABLED;
    });

    it('più di 2 ore dall’ultimo giro riuscito: segnalato', async () => {
      mq.invoiceImportState.mockResolvedValue(state('2026-10-19T09:00:00Z'));
      expect((await run()).invoice_import_stalled).toEqual({
        count: 1,
        items: [{ last_success_at: '2026-10-19T09:00:00.000Z', last_error: 'connessione persa' }],
      });
    });

    it('mai riuscito dopo un tentativo: segnalato', async () => {
      mq.invoiceImportState.mockResolvedValue(state(null));
      expect((await run()).invoice_import_stalled.count).toBe(1);
    });

    it.each([
      ['ultimo giro riuscito di recente', () => state('2026-10-19T11:45:00Z')],
      ['spento dal pannello', () => state('2026-10-18T09:00:00Z', 0)],
      [
        'forzato spento',
        () => {
          process.env.INVOICE_IMPORT_DISABLED = 'true';
          return state('2026-10-18T09:00:00Z');
        },
      ],
      [
        'non configurato',
        () => {
          delete process.env.PEC_IMAP_HOST;
          return state('2026-10-18T09:00:00Z');
        },
      ],
    ])('%s: nessuna segnalazione', async (_label, row) => {
      mq.invoiceImportState.mockResolvedValue(row());
      expect((await run()).invoice_import_stalled.count).toBe(0);
    });
  });

  it('import: in attesa, strutture senza pattern e matricole diverse una volta per utenza', async () => {
    mq.pendingSdiMessages.mockResolvedValue([
      { id: '3', supplier: null, document_number: 'F1', document_date: new Date(2026, 9, 2) },
    ]);
    const structure = {
      supplier_id: 1,
      supplier: 'X',
      document_type: 'TD01',
      structure_key: 'k',
      count: 2,
      structures: 1,
      message_id: 9,
    };
    jest.mocked(unknown.unknownStructures).mockResolvedValue([structure]);
    const issue = (id: number, type: string, utility: number | null) => ({
      id,
      message_id: 1,
      invoice_id: null,
      number: null,
      type,
      detail: `d${id}`,
      utility_id: utility,
      utility_code: utility ? `IT${utility}` : null,
    });
    mq.importIssues.mockResolvedValue([
      issue(1, 'METER_MISMATCH', 7),
      issue(2, 'METER_MISMATCH', 7),
      issue(3, 'METER_MISMATCH', null),
      issue(4, 'TOTAL_MISMATCH', 8),
    ]);
    const a = await run();
    expect(a.invoice_import_pending.items).toEqual([
      { id: 3, supplier: null, number: 'F1', date: '2026-10-02' },
    ]);
    expect(a.invoice_patterns_unknown.items).toEqual([structure]);
    expect(a.invoice_import_issues.count).toBe(4);
    expect(a.utilities_with_meter_mismatch.items).toEqual([
      { id: 7, utility_id: 'IT7', detail: 'd2' },
    ]);
  });

  describe('contabilità non aggiornata', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const stale = async (row: Row | undefined, present = true) => {
      mq.accountingImportState.mockResolvedValue(row);
      service.inboxPresent = () => present;
      return (await run()).accounting_import_stale;
    };

    it('3 giorni senza caricamento: una riga', async () => {
      expect(
        await stale({ enabled: 1, last_success_at: new Date(NOW.getTime() - 3 * DAY) }),
      ).toEqual({
        count: 1,
        items: [{ id: 1, label: 'Contabilità non aggiornata da 3 giorni' }],
      });
    });

    it('mai caricata', async () => {
      expect((await stale({ enabled: 1, last_success_at: null })).items).toEqual([
        { id: 1, label: 'Contabilità mai caricata' },
      ]);
    });

    it.each([
      ['1 giorno', { enabled: 1, last_success_at: new Date(NOW.getTime() - DAY) }, true],
      ['import spento', { enabled: 0, last_success_at: null }, true],
      ['container assente', { enabled: 1, last_success_at: null }, false],
      ['nessuno stato', undefined, true],
    ])('%s: niente', async (_label, row, present) => {
      expect((await stale(row, present)).count).toBe(0);
    });

    it('forzato spento dall’ambiente: niente', async () => {
      process.env.ACCOUNTING_IMPORT_DISABLED = 'true';
      expect((await stale({ enabled: 1, last_success_at: null })).count).toBe(0);
    });
  });

  it('capitoli oltre l’assestato: etichette lette per quelli sforati, cancellati esclusi', async () => {
    summary.mockResolvedValue([
      {
        budget_chapter_id: 1,
        over_budget: true,
        adjusted_budget: 100,
        committed: 120,
        invoiced: 0,
      },
      { budget_chapter_id: 2, over_budget: true, adjusted_budget: 10, committed: 20, invoiced: 0 },
      { budget_chapter_id: 3, over_budget: false, adjusted_budget: 10, committed: 0, invoiced: 0 },
    ] as never);
    mq.chapterLabels.mockResolvedValue([
      { id: 1, chapter_code: '100', article: 1, description: 'Luce' },
    ]);
    const a = await run();
    expect(mq.chapterLabels).toHaveBeenCalledWith(expect.anything(), [1, 2]);
    expect(a.chapters_over_budget.items).toEqual([
      {
        id: 1,
        chapter: '100/1',
        description: 'Luce',
        adjusted_budget: 100,
        committed: 120,
        invoiced: 0,
      },
    ]);
  });

  it('nessun capitolo sforato: etichette non lette', async () => {
    await run();
    expect(mq.chapterLabels).not.toHaveBeenCalled();
  });

  it('verifiche di legge: confronto in Node sui tipi con data', async () => {
    mq.inspectionCandidates.mockResolvedValue([
      {
        id: 1,
        code: 'A',
        name: 'Asc',
        type: 'ELEVATOR',
        status: 'ACTIVE',
        grounding_class: null,
        lightning_protection: null,
        power_kw: null,
        dated_kinds: null,
      },
      {
        id: 2,
        code: 'B',
        name: 'Asc',
        type: 'ELEVATOR',
        status: 'ACTIVE',
        grounding_class: null,
        lightning_protection: null,
        power_kw: null,
        dated_kinds: `Manutenzione\n${ELEVATOR_INSPECTION_KIND}`,
      },
    ]);
    expect((await run()).plants_missing_inspections.items).toEqual([
      { id: 1, code: 'A', name: 'Asc', type: 'ELEVATOR', missing: ELEVATOR_INSPECTION_KIND },
    ]);
  });

  it('estintori e penali reattive: oggi passato da Node', async () => {
    await run();
    const day = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);
    expect(mq.fireEquipmentOverdue).toHaveBeenCalledWith(expect.anything(), day);
    expect(mq.reactivePenalty).toHaveBeenCalledWith(expect.anything(), day);
  });

  it('fabbisogno: una voce per convenzione, capitoli e impegni raggruppati', async () => {
    mq.agreementsShort.mockResolvedValue([
      {
        id: 5,
        name: 'Luce 21',
        chapter_id: 1,
        chapter_code: '100',
        article: 1,
        description: ' Luce ',
        shortfall: '300.10',
        commitment_ids: '7,8',
      },
      {
        id: 5,
        name: 'Luce 21',
        chapter_id: null,
        chapter_code: null,
        article: null,
        description: null,
        shortfall: '0.20',
        commitment_ids: '8',
      },
      {
        id: 6,
        name: 'Gas',
        chapter_id: 2,
        chapter_code: '200',
        article: 0,
        description: null,
        shortfall: '5',
        commitment_ids: null,
      },
    ]);
    mq.chaptersVariationNeeded.mockResolvedValue([
      {
        id: 1,
        chapter_code: '100',
        article: 1,
        description: null,
        missing: '300.10',
        available: '-20.5',
      },
    ]);
    const a = await run();
    expect(a.agreements_commitments_short.items).toEqual([
      {
        id: 5,
        label: 'Luce 21',
        missing: 300.3,
        chapters: [
          { id: 1, label: '100/1 — Luce', missing: 300.1 },
          { id: null, label: 'Senza capitolo', missing: 0.2 },
        ],
        commitment_ids: [7, 8],
      },
      {
        id: 6,
        label: 'Gas',
        missing: 5,
        chapters: [{ id: 2, label: '200/0', missing: 5 }],
        commitment_ids: [],
      },
    ]);
    expect(a.chapters_variation_needed.items).toEqual([
      { id: 1, chapter: '100/1', description: null, missing: 300.1, available: -20.5 },
    ]);
  });

  it('bozze scadute: CIG vuoto = null', async () => {
    mq.draftsOverdue.mockResolvedValue([
      { id: '4', cig_contract: '  ', supply_start_date: '2026-10-01' },
      { id: 5, cig_contract: ' Z1 ', supply_start_date: '2026-10-02' },
    ]);
    expect((await run()).contracts_draft_overdue.items).toEqual([
      { id: 4, cig_contract: null, supply_start_date: '2026-10-01' },
      { id: 5, cig_contract: 'Z1', supply_start_date: '2026-10-02' },
    ]);
  });

  it('contabilità: liquidazioni, impegni e capitoli ambigui convertiti', async () => {
    ms.liquidationsUnmatched.mockResolvedValue([
      {
        id: 'L1',
        number: '13',
        date: new Date(2025, 2, 1),
        amount: '10.50',
        supplier_vat: null,
        commitment: '2025/7/1',
      },
    ]);
    mq.accountingCommitmentsWithoutContract.mockResolvedValue([
      { id: '3', commitment_year: '2025', commitment_num: '3', commitment_sub: '1' },
    ]);
    ms.utilityChapterAmbiguous.mockResolvedValue([
      { id: '2', utility_id: 'IT2', chapters: 'A/0, B/0' },
    ]);
    mq.sharesMismatch.mockResolvedValue([
      { id: '9', number: 'F9', total: '100.00', shares: '99.98' },
    ]);
    const a = await run();
    expect(a.accounting_liquidations_unmatched.items).toEqual([
      {
        id: 'L1',
        number: '13',
        date: '2025-03-01',
        amount: 10.5,
        supplier_vat: null,
        commitment: '2025/7/1',
      },
    ]);
    expect(a.accounting_commitments_without_contract.items).toEqual([{ id: 3, label: '2025/3/1' }]);
    expect(a.accounting_utility_chapter_ambiguous.items).toEqual([
      { id: 2, utility_id: 'IT2', chapters: 'A/0, B/0' },
    ]);
    expect(a.invoices_shares_mismatch.items).toEqual([
      { id: 9, number: 'F9', total: 100, shares: 99.98 },
    ]);
  });
});
