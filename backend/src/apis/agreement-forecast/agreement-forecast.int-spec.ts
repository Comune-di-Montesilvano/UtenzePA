import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import * as forecastModule from '@apis/spending/agreement-forecast';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertConsipAgreement,
  insertContract,
  insertInvoice,
  insertInvoiceLine,
  insertThirdParty,
  insertUtility,
  insertUtilityType,
} from '../../test/integration/fixtures';
import { AgreementForecastService } from './agreement-forecast.service';
import { ConsipAgreementPrice } from './entity/agreement-price.entity';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

// Valori numerici come numeri: MySQL restituisce i decimali come stringhe, quello che
// conta è il valore che arriva al calcolo.
const plain = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object' && !(v instanceof Date))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

describe('AgreementForecastService (integrazione)', () => {
  let ds: DataSource;
  let service: AgreementForecastService;
  let spy: jest.SpyInstance;
  let supplier: number;
  let agreement: number;
  let other: number;
  let chapter: number;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new AgreementForecastService(ds, ds.getRepository(ConsipAgreementPrice));
  });

  afterAll(() => ds.destroy());

  beforeEach(async () => {
    await resetTables(ds, [
      'consip_agreement_forecasts',
      'consip_agreement_prices',
      'invoice_commitment_shares',
      'budget_commitment_contracts',
      'budget_commitment_years',
      'budget_commitments',
      'budget_chapters',
      'utility_supply_events',
      'utility_consumptions',
      'invoice_lines',
      'invoices',
      'contract_utilities',
      'contracts',
      'consip_agreement',
      'utilities',
      'third_parties',
    ]);
    spy = jest.spyOn(forecastModule, 'agreementForecast');
    supplier = await insertThirdParty(ds);
    agreement = await insertConsipAgreement(ds, supplier);
    other = await insertConsipAgreement(ds, supplier);
    chapter = await insert(ds, 'budget_chapters', {
      ...AUTHOR,
      chapter_code: '1234',
      article: '1',
      description: 'Energia elettrica',
    });
  });

  afterEach(() => spy.mockRestore());

  const input = () => plain(spy.mock.calls[0][0]) as Record<string, any>;
  const order = (over: Record<string, unknown> = {}) =>
    insertContract(ds, { consip_agreement_id: agreement, ...over });
  const attach = (contract: number, utility: number) =>
    insert(ds, 'contract_utilities', { contract_id: contract, utility_id: utility });
  const commitment = async (
    contracts: number[],
    years: [number, number | null][],
    over: Record<string, unknown> = {},
  ) => {
    const id = await insert(ds, 'budget_commitments', {
      ...AUTHOR,
      budget_chapter_id_fk: chapter,
      ...over,
    });
    for (const [fiscal_year, amount] of years)
      await insert(ds, 'budget_commitment_years', { commitment_id: id, fiscal_year, amount });
    for (const contract_id of contracts)
      await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id });
    return id;
  };
  const share = (invoice: number, commitmentId: number, fiscal_year: number, amount: number) =>
    insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: invoice,
      commitment_id_fk: commitmentId,
      fiscal_year,
      amount,
    });

  it('convenzione cancellata o inesistente: non trovata', async () => {
    const deleted = await insertConsipAgreement(ds, supplier, { deleted: 1 });
    await expect(service.compute(deleted)).rejects.toThrow('Convenzione non trovata');
    await expect(service.compute(999999)).rejects.toThrow('Convenzione non trovata');
  });

  it('ordini: contratti non cancellati della convenzione, bozze e chiusi compresi, con le utenze', async () => {
    const live = await order({ supply_start_date: '2025-01-01', supply_expiry_date: '2025-12-31' });
    const draft = await order({ draft: 1 });
    const closed = await order({ closed: 1 });
    await order({ deleted: 1 });
    await insertContract(ds, { consip_agreement_id: other });
    const u1 = await insertUtility(ds);
    const u2 = await insertUtility(ds);
    await attach(live, u1);
    await attach(live, u2);
    await attach(closed, u1);

    await service.compute(agreement);
    expect(input().orders).toEqual([
      {
        id: live,
        draft: false,
        closed: false,
        start: '2025-01-01',
        end: '2025-12-31',
        utility_ids: [u1, u2],
      },
      { id: draft, draft: true, closed: false, start: null, end: null, utility_ids: [] },
      { id: closed, draft: false, closed: true, start: null, end: null, utility_ids: [u1] },
    ]);
  });

  it('utenze: dati, righe di fatture valide, rilevazioni e storico fino alla data', async () => {
    const type = await insertUtilityType(ds, { hard_type: 'GAS' });
    const u = await insertUtility(ds, {
      utility_id: 'PDR-1',
      utility_type_id_fk: type,
      budget_chapter_code_fk: chapter,
      estimated_annual_consumption: 1500,
    });
    const deletedUtility = await insertUtility(ds, { deleted: 1 });
    const c = await order();
    await attach(c, u);
    await attach(c, deletedUtility);

    const valid = await insertInvoice(ds, { invoice_date: '2025-03-10' });
    await insertInvoiceLine(ds, valid, 120.5, {
      utility_id_fk: u,
      period_start: '2025-01-01',
      period_end: '2025-02-28',
    });
    const late = await insertInvoice(ds, { invoice_date: '2025-07-01' });
    await insertInvoiceLine(ds, late, 80, { utility_id_fk: u });
    for (const over of [
      { deleted: 1 },
      { sdi_status: 'REJECTED' },
      { payment_status: 'CANCELLED' },
    ]) {
      await insertInvoiceLine(ds, await insertInvoice(ds, over), 999, { utility_id_fk: u });
    }

    const reading = await insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: u,
      kind: 'READING',
      reading_date: '2025-02-01',
      reading_value: 100,
      meter_number: 'M1',
      is_estimated: 1,
    });
    const period = await insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: u,
      kind: 'PERIOD',
      period_start: '2025-01-01',
      period_end: '2025-03-31',
      consumption: 42.5,
    });
    await insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: u,
      kind: 'READING',
      reading_date: '2025-08-01',
      reading_value: 200,
    });
    await insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: u,
      kind: 'READING',
      reading_date: '2025-01-15',
      reading_value: 50,
      deleted: 1,
    });

    const party = await insertThirdParty(ds);
    const ev = await insert(ds, 'utility_supply_events', {
      ...AUTHOR,
      utility_id_fk: u,
      type: 'TRANSFER',
      third_party_id_fk: party,
      requested_on: '2025-01-10',
      effective_on: '2025-02-01',
      cancelled_on: '2025-03-01',
    });
    await insert(ds, 'utility_supply_events', {
      ...AUTHOR,
      utility_id_fk: u,
      type: 'ACTIVATION',
      deleted: 1,
    });

    await service.compute(agreement, { asOf: '2025-06-30' });
    const { utilities } = input();
    expect(utilities).toHaveLength(1);
    const [row] = utilities;
    expect(row).toEqual(
      expect.objectContaining({
        id: u,
        utility_code: 'PDR-1',
        hard_type: 'GAS',
        chapter_id: chapter,
        estimated_annual_consumption: 1500,
        lines: [
          {
            amount: 120.5,
            period_start: '2025-01-01',
            period_end: '2025-02-28',
            invoice_date: '2025-03-10',
          },
        ],
      }),
    );
    expect(row.consumptions).toEqual([
      expect.objectContaining({
        id: reading,
        utility_id: u,
        kind: 'READING',
        reading_date: '2025-02-01',
        reading_value: 100,
        meter_number: 'M1',
        period_start: null,
        period_end: null,
        consumption: null,
        is_estimated: 1,
      }),
      expect.objectContaining({
        id: period,
        kind: 'PERIOD',
        reading_date: null,
        period_start: '2025-01-01',
        period_end: '2025-03-31',
        consumption: 42.5,
        is_estimated: 0,
      }),
    ]);
    expect(row.events).toEqual([
      expect.objectContaining({
        id: ev,
        utility_id: u,
        type: 'TRANSFER',
        third_party_id_fk: party,
        requested_on: '2025-01-10',
        effective_on: '2025-02-01',
        date_unknown: false,
        cancelled_on: '2025-03-01',
        utilizer_grant_id_fk: null,
        deleted: false,
      }),
    ]);
    // Calcolo a una data passata: nessuna cache.
    expect(await ds.query('SELECT id FROM consip_agreement_forecasts')).toEqual([]);
  });

  it('impegnato e rimanenza per capitolo ed esercizio, solo impegni della convenzione', async () => {
    const c = await order({ draft: 1 });
    const foreign = await insertContract(ds, { consip_agreement_id: other });
    const unrelated = await insertContract(ds);
    const main = await commitment(
      [c],
      [
        [2025, 1000],
        [2026, null],
      ],
      { commitment_year: 2025, commitment_num: 10 },
    );
    const shared = await commitment([c, foreign], [[2025, 500]], {
      commitment_year: 2025,
      commitment_num: 11,
      commitment_sub: 2,
    });
    await commitment([unrelated], [[2025, 7777]]);
    await commitment([c], [[2025, 3333]], { deleted: 1 });
    const deletedOrder = await order({ deleted: 1 });
    await commitment([deletedOrder], [[2025, 4444]]);

    // Quota su fattura con righe per utenza: conta nella rimanenza, non tra le quote senza righe.
    const withLines = await insertInvoice(ds);
    await insertInvoiceLine(ds, withLines, 300, { utility_id_fk: await insertUtility(ds) });
    await share(withLines, main, 2025, 300);
    // Canone (fattura senza righe per utenza).
    const fee = await insertInvoice(ds);
    await insertInvoiceLine(ds, fee, 50);
    await share(fee, shared, 2025, 50);
    // Fattura rifiutata: fuori da tutto.
    const rejected = await insertInvoice(ds, { sdi_status: 'REJECTED' });
    await share(rejected, main, 2025, 999);

    const result = await service.compute(agreement);
    expect(input().committed).toEqual(
      expect.arrayContaining([
        { chapter_id: chapter, year: 2025, committed: 1500, remaining: 1150, without_amount: 0 },
        { chapter_id: chapter, year: 2026, committed: 0, remaining: 0, without_amount: 1 },
      ]),
    );
    expect(input().committed).toHaveLength(2);
    expect(result.shared_commitments).toEqual([
      { id: shared, label: expect.stringContaining('11') },
    ]);
    expect(result.shares_without_lines).toEqual([{ year: 2025, amount: 50 }]);
  });

  it('prezzi a mano e capitoli delle righe; cache scritta', async () => {
    const type = await insertUtilityType(ds, { hard_type: 'LIGHT' });
    const u = await insertUtility(ds, {
      utility_type_id_fk: type,
      budget_chapter_code_fk: chapter,
    });
    const c = await order({ supply_start_date: '2025-01-01', supply_expiry_date: '2026-12-31' });
    await attach(c, u);
    await commitment([c], [[2026, 1000]]);
    await service.setPrice(agreement, 'LIGHT' as never, 0.25, SYSTEM_USER_ID);

    expect(input().manualPrices).toEqual({ LIGHT: 0.25 });
    const result = spy.mock.results[0].value as { rows: unknown[] };
    const response = await service.compute(agreement);
    expect(response.chapters).toEqual([{ id: chapter, label: '1234/1 — Energia elettrica' }]);
    const cached = await ds.query(
      'SELECT budget_chapter_id_fk, fiscal_year FROM consip_agreement_forecasts WHERE consip_agreement_id_fk = ?',
      [agreement],
    );
    expect(cached.length).toBe(result.rows.length);
  });

  it('ricalcolo: convenzioni con un ordine non chiuso e convenzioni dei contratti', async () => {
    const closedOnly = await insertConsipAgreement(ds, supplier);
    await insertContract(ds, { consip_agreement_id: closedOnly, closed: 1 });
    const openOrder = await order();
    await insertContract(ds, { consip_agreement_id: other, deleted: 1 });
    const noAgreement = await insertContract(ds);
    const computed = jest.spyOn(service, 'compute');
    try {
      expect(await service.refreshAll()).toEqual({ processed: 1, failed: 0 });
      expect(computed.mock.calls.map((c) => c[0])).toEqual([agreement]);
      computed.mockClear();
      await service.refreshForContracts([openOrder, noAgreement]);
      expect(computed.mock.calls.map((c) => c[0])).toEqual([agreement]);
    } finally {
      computed.mockRestore();
    }
  });
});
