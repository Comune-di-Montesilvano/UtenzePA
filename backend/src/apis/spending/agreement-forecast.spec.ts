import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ConsumptionKind } from '@apis/utility-consumptions/enum/consumption-kind.enum';
import {
  buildDailyConsumption,
  type ConsumptionRecord,
  fromDay,
  toDay,
} from '@apis/utility-consumptions/consumption-calculator';
import { SupplyEventType } from '@apis/utility-supply/enum/supply-event-type.enum';
import type { SupplyEventLike } from '@apis/utility-supply/supply-state';
import type { StatsLine } from './chapter-utility-stats';
import {
  type AgreementForecast,
  agreementForecast,
  consumptionTrend,
  dailySpend,
  expectedDayCost,
  type ForecastInput,
  type ForecastOrder,
  shortfall,
  type ForecastUtility,
  proposedPrice,
  sameDayLastYear,
  utilityDays,
} from './agreement-forecast';

const utility = (id: number, over: Partial<ForecastUtility> = {}): ForecastUtility => ({
  id,
  utility_code: `POD${id}`,
  hard_type: HardTypeEnum.LIGHT,
  chapter_id: 7,
  estimated_annual_consumption: null,
  lines: [],
  consumptions: [],
  events: [],
  ...over,
});

const order = (id: number, start: string | null, end: string | null, ids: number[]): ForecastOrder => ({
  id,
  draft: false,
  closed: false,
  start,
  end,
  utility_ids: ids,
});

const event = (
  id: number,
  type: SupplyEventType,
  effective: string,
  over: Partial<SupplyEventLike> = {},
): SupplyEventLike => ({
  id,
  type,
  third_party_id_fk: type === SupplyEventType.TRANSFER ? 5 : null,
  requested_on: null,
  effective_on: effective,
  date_unknown: false,
  cancelled_on: null,
  deleted: false,
  utilizer_grant_id_fk: null,
  create_date: '2020-01-01',
  ...over,
});

const period = (start: string, end: string, consumption: number): ConsumptionRecord => ({
  kind: ConsumptionKind.PERIOD,
  period_start: start,
  period_end: end,
  consumption,
});

const line = (amount: number, start: string | null, end: string | null, invoice = '2026-01-31'): StatsLine => ({
  amount,
  period_start: start,
  period_end: end,
  invoice_date: invoice,
});

// Consumo costante al giorno su un intervallo.
const flat = (start: string, end: string, perDay: number) =>
  buildDailyConsumption([period(start, end, perDay * (toDay(end) - toDay(start) + 1))]);

const days = (list: number[]) => list.map(fromDay);

describe('utilityDays', () => {
  it('un ordine: tutti i suoi giorni, estremi inclusi', () => {
    const d = utilityDays([order(1, '2026-01-01', '2026-01-10', [1])], utility(1));
    expect(d).toHaveLength(10);
    expect(days(d)[0]).toBe('2026-01-01');
    expect(days(d)[9]).toBe('2026-01-10');
  });

  it('due ordini sovrapposti: i giorni doppi contano una volta', () => {
    const d = utilityDays(
      [order(1, '2026-01-01', '2026-01-10', [1]), order(2, '2026-01-05', '2026-01-20', [1])],
      utility(1),
    );
    expect(d).toHaveLength(20);
    expect(new Set(d).size).toBe(20);
  });

  it('ordine senza una data: ignorato; utenza non collegata: nessun giorno', () => {
    expect(utilityDays([order(1, '2026-01-01', null, [1])], utility(1))).toEqual([]);
    expect(utilityDays([order(1, null, '2026-01-10', [1])], utility(1))).toEqual([]);
    expect(utilityDays([order(1, '2026-01-01', '2026-01-10', [2])], utility(1))).toEqual([]);
  });

  it('cessazione effettiva: conta fino al giorno della cessazione', () => {
    const u = utility(1, {
      events: [
        event(1, SupplyEventType.ACTIVATION, '2020-01-01'),
        event(2, SupplyEventType.CESSATION, '2026-01-06'),
      ],
    });
    const d = days(utilityDays([order(1, '2026-01-01', '2026-01-10', [1])], u));
    expect(d).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06']);
  });

  it('voltura e reintestazione: fuori i giorni tra le due', () => {
    const u = utility(1, {
      events: [
        event(1, SupplyEventType.ACTIVATION, '2020-01-01'),
        event(2, SupplyEventType.TRANSFER, '2026-01-04'),
        event(3, SupplyEventType.RETURN, '2026-01-08'),
      ],
    });
    const d = days(utilityDays([order(1, '2026-01-01', '2026-01-10', [1])], u));
    expect(d).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
    ]);
  });

  it('solo una voltura, nessuna attivazione registrata: del Comune fino alla voltura', () => {
    const u = utility(1, { events: [event(2, SupplyEventType.TRANSFER, '2026-01-04')] });
    expect(utilityDays([order(1, '2026-01-01', '2026-01-10', [1])], u)).toHaveLength(4);
  });
});

describe('sameDayLastYear', () => {
  it('stesso giorno e mese; il 29 febbraio diventa 28', () => {
    expect(fromDay(sameDayLastYear(toDay('2026-03-10')))).toBe('2025-03-10');
    expect(fromDay(sameDayLastYear(toDay('2028-02-29')))).toBe('2027-02-28');
    expect(fromDay(sameDayLastYear(toDay('2029-02-28')))).toBe('2028-02-28');
  });
});

describe('consumptionTrend', () => {
  const today = toDay('2026-06-30');
  const both = (now: number, before: number) =>
    new Map([...flat('2025-01-01', '2025-12-31', before), ...flat('2026-01-01', '2026-06-30', now)]);

  it('rapporto tra gli ultimi 90 giorni e gli stessi giorni dell’anno prima', () => {
    expect(consumptionTrend([both(10, 8)], today)).toBeCloseTo(1.25, 6);
  });

  it('limitato tra 0,7 e 1,5', () => {
    expect(consumptionTrend([both(30, 10)], today)).toBe(1.5);
    expect(consumptionTrend([both(1, 10)], today)).toBe(0.7);
  });

  it('senza dati dell’anno prima o recenti: 1', () => {
    expect(consumptionTrend([flat('2026-01-01', '2026-06-30', 10)], today)).toBe(1);
    expect(consumptionTrend([flat('2025-01-01', '2025-12-31', 10)], today)).toBe(1);
    expect(consumptionTrend([], today)).toBe(1);
  });

  it('somma su più utenze', () => {
    expect(consumptionTrend([both(10, 10), both(20, 10)], today)).toBeCloseTo(1.5, 6);
  });
});

describe('proposedPrice', () => {
  it('spesa diviso consumo', () => {
    const lines = [line(300, '2026-01-01', '2026-01-30')];
    expect(proposedPrice([{ lines, daily: flat('2026-01-01', '2026-01-30', 10) }])).toBeCloseTo(1, 6);
  });

  it('conta solo i giorni con consumo', () => {
    const lines = [line(300, '2026-01-01', '2026-01-30')];
    expect(proposedPrice([{ lines, daily: flat('2026-01-01', '2026-01-15', 10) }])).toBeCloseTo(1, 6);
  });

  it('consumo zero o nessuna riga: null, mai Infinity', () => {
    const lines = [line(300, '2026-01-01', '2026-01-30')];
    expect(proposedPrice([{ lines, daily: new Map() }])).toBeNull();
    expect(proposedPrice([{ lines, daily: flat('2026-01-01', '2026-01-30', 0) }])).toBeNull();
    expect(proposedPrice([{ lines: [], daily: flat('2026-01-01', '2026-01-30', 10) }])).toBeNull();
    expect(proposedPrice([])).toBeNull();
  });

  it('righe più vecchie della finestra rispetto all’ultima non contano', () => {
    const lines = [line(9000, '2025-01-01', '2025-01-30'), line(300, '2026-01-01', '2026-01-30')];
    const daily = new Map([...flat('2025-01-01', '2025-01-30', 10), ...flat('2026-01-01', '2026-01-30', 10)]);
    expect(proposedPrice([{ lines, daily }])).toBeCloseTo(1, 6);
  });
});

describe('dailySpend', () => {
  const today = toDay('2026-12-31');

  it('media sui giorni coperti dell’ultimo anno', () => {
    expect(dailySpend([line(365, '2026-01-01', '2026-12-31')], today)).toBeCloseTo(1, 6);
    expect(dailySpend([line(60, '2026-11-02', '2026-12-31')], today)).toBeCloseTo(1, 6);
  });

  it('nessuna riga nell’ultimo anno: null', () => {
    expect(dailySpend([line(365, '2024-01-01', '2024-12-31')], today)).toBeNull();
    expect(dailySpend([], today)).toBeNull();
  });
});

describe('expectedDayCost', () => {
  const today = toDay('2026-01-31');
  const ctx = { today, trend: 1.25, price: 0.5 };
  const target = toDay('2026-03-10');

  it('storico: consumo dello stesso giorno dell’anno prima × andamento × prezzo', () => {
    const daily = flat('2025-01-01', '2025-12-31', 8);
    const r = expectedDayCost(utility(1), daily, ctx);
    expect(r.source).toBe('history');
    expect(r.consumption(target)).toBeCloseTo(10, 6);
    expect(r.cost(target)).toBeCloseTo(5, 6);
  });

  it('29 febbraio: usa il 28 dell’anno prima', () => {
    const daily = flat('2027-01-01', '2027-12-31', 8);
    const r = expectedDayCost(utility(1), daily, { today: toDay('2028-01-31'), trend: 1, price: 1 });
    expect(r.cost(toDay('2028-02-29'))).toBeCloseTo(8, 6);
  });

  it('senza storico ma col presunto annuo: quota giornaliera × prezzo', () => {
    const r = expectedDayCost(utility(1, { estimated_annual_consumption: 3650 }), new Map(), ctx);
    expect(r.source).toBe('annual');
    expect(r.cost(target)).toBeCloseTo(5, 6);
  });

  it('senza consumi ma con righe: sola spesa', () => {
    const u = utility(1, { lines: [line(365, '2025-02-01', '2026-01-31')] });
    const r = expectedDayCost(u, new Map(), ctx);
    expect(r.source).toBe('spend');
    expect(r.cost(target)).toBeCloseTo(1, 6);
    expect(r.consumption(target)).toBeNull();
  });

  it('storico tutto a zero con righe (quote fisse): sola spesa', () => {
    const u = utility(1, { lines: [line(365, '2025-02-01', '2026-01-31')] });
    const r = expectedDayCost(u, flat('2025-01-01', '2025-12-31', 0), ctx);
    expect(r.source).toBe('spend');
  });

  it('senza prezzo: sola spesa se ci sono righe, altrimenti nessun dato', () => {
    const daily = flat('2025-01-01', '2025-12-31', 8);
    const withLines = utility(1, { lines: [line(365, '2025-02-01', '2026-01-31')] });
    expect(expectedDayCost(withLines, daily, { ...ctx, price: null }).source).toBe('spend');
    expect(expectedDayCost(utility(1), daily, { ...ctx, price: null }).source).toBe('none');
  });

  it('nessun dato: costo zero', () => {
    const r = expectedDayCost(utility(1), new Map(), ctx);
    expect(r.source).toBe('none');
    expect(r.cost(target)).toBe(0);
  });
});

describe('shortfall', () => {
  const row = (committed: number, difference: number, coverage = 0.9) => ({
    committed,
    difference,
    coverage,
    to_invoice: 1000,
  });

  it('sotto 200 € o sotto il 5 % dell’impegnato: nessun avviso', () => {
    expect(shortfall(row(10000, -150))).toEqual({ shortfall: null, alert: null });
    expect(shortfall(row(10000, -400))).toEqual({ shortfall: null, alert: null });
    expect(shortfall(row(10000, 300))).toEqual({ shortfall: null, alert: null });
  });

  it('oltre le due soglie con copertura sufficiente: avviso con l’importo', () => {
    expect(shortfall(row(10000, -600))).toEqual({ shortfall: 600, alert: 'short' });
  });

  it('copertura sotto il 60 %: dati insufficienti, nessun importo', () => {
    expect(shortfall(row(10000, -600, 0.5))).toEqual({ shortfall: null, alert: 'insufficient_data' });
  });

  it('nessun impegno e spesa prevista: manca tutto', () => {
    expect(shortfall(row(0, -500, 1))).toEqual({ shortfall: 500, alert: 'short' });
  });
});

describe('agreementForecast', () => {
  const today = toDay('2026-01-31');
  // 10 al giorno dal 2025 a fine gennaio 2026 (396 giorni).
  const history = [period('2025-01-01', '2026-01-31', 3960)];
  const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
    today,
    orders: [order(1, '2026-01-01', '2026-12-31', [1])],
    utilities: [
      utility(1, { consumptions: history, lines: [line(310, '2026-01-01', '2026-01-31')] }),
    ],
    committed: [{ chapter_id: 7, year: 2026, committed: 3000, remaining: 2690, without_amount: 0 }],
    manualPrices: { [HardTypeEnum.LIGHT]: 1 },
    ...over,
  });
  const rowOf = (f: AgreementForecast, chapter: number | null, year: number) =>
    f.rows.find((r) => r.chapter_id === chapter && r.year === year);

  it('caso base: fatturato reale, resto previsto, differenza sulla rimanenza', () => {
    const f = agreementForecast(base());
    expect(f.horizon).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(rowOf(f, 7, 2026)).toEqual({
      chapter_id: 7,
      year: 2026,
      utilities: 1,
      invoiced: 310,
      to_invoice: 3340,
      total: 3650,
      committed: 3000,
      remaining: 2690,
      difference: -650,
      coverage: 1,
      shortfall: 650,
      alert: 'short',
    });
    expect(f.prices).toEqual([
      { hard_type: HardTypeEnum.LIGHT, proposed: 1, manual: 1, used: 1, trend: 1 },
    ]);
    expect(f.utilities[0]).toMatchObject({ id: 1, source: 'history', from_draft: false });
    expect(f.utilities[0].years).toEqual([
      { year: 2026, invoiced: 310, to_invoice: 3340, expected_consumption: 3340 },
    ]);
  });

  it('senza prezzo a mano usa il proposto', () => {
    const f = agreementForecast(base({ manualPrices: {} }));
    expect(f.prices[0]).toMatchObject({ proposed: 1, manual: null, used: 1 });
    expect(rowOf(f, 7, 2026)?.to_invoice).toBe(3340);
  });

  it('nota di credito sui giorni fatturati: il giorno resta fatturato, importo col segno', () => {
    const f = agreementForecast(
      base({
        utilities: [
          utility(1, {
            consumptions: history,
            lines: [line(310, '2026-01-01', '2026-01-31'), line(-31, '2026-01-01', '2026-01-31')],
          }),
        ],
      }),
    );
    expect(rowOf(f, 7, 2026)).toMatchObject({ invoiced: 279, to_invoice: 3340 });
  });

  it('utenza senza capitolo e annualità senza importo: nessun errore', () => {
    const f = agreementForecast(
      base({
        utilities: [utility(1, { chapter_id: null, consumptions: history })],
        committed: [{ chapter_id: null, year: 2026, committed: 0, remaining: 0, without_amount: 1 }],
      }),
    );
    expect(rowOf(f, null, 2026)).toMatchObject({ chapter_id: null, committed: 0, utilities: 1 });
  });

  it('ordine a cavallo d’anno: una riga per esercizio con i suoi giorni', () => {
    const f = agreementForecast(
      base({
        orders: [order(1, '2026-07-01', '2027-06-30', [1])],
        utilities: [utility(1, { consumptions: history })],
        committed: [],
      }),
    );
    expect(rowOf(f, 7, 2026)?.to_invoice).toBe(1840);
    expect(rowOf(f, 7, 2027)?.to_invoice).toBe(1810);
    // Avviso solo sull'esercizio in corso.
    expect(rowOf(f, 7, 2026)?.alert).toBe('short');
    expect(rowOf(f, 7, 2027)?.alert).toBeNull();
  });

  it('utenza che entra a metà orizzonte e ordine in bozza', () => {
    const f = agreementForecast(
      base({
        orders: [
          order(1, '2026-01-01', '2026-12-31', [1]),
          { ...order(2, '2026-07-01', '2026-12-31', [2]), draft: true },
        ],
        utilities: [
          utility(1, { consumptions: history }),
          utility(2, { consumptions: history }),
        ],
        committed: [],
      }),
    );
    expect(rowOf(f, 7, 2026)).toMatchObject({ utilities: 2, to_invoice: 3650 + 1840 });
    expect(f.utilities.find((u) => u.id === 2)?.from_draft).toBe(true);
    expect(f.utilities.find((u) => u.id === 1)?.from_draft).toBe(false);
  });

  it('esercizio chiuso: nessuna proiezione né avviso', () => {
    const f = agreementForecast(base({ today: toDay('2027-02-01') }));
    expect(rowOf(f, 7, 2026)).toMatchObject({
      invoiced: 310,
      to_invoice: 0,
      shortfall: null,
      alert: null,
    });
  });

  it('riga senza periodo: nel fatturato dell’anno, non copre giorni', () => {
    const f = agreementForecast(
      base({
        utilities: [utility(1, { consumptions: history, lines: [line(50, null, null, '2026-01-15')] })],
      }),
    );
    expect(rowOf(f, 7, 2026)).toMatchObject({ invoiced: 50, to_invoice: 3650, coverage: 0 });
    expect(f.utilities[0].lines_without_period).toBe(true);
  });

  it('avvisi: ordine senza date, utenza senza dati, altro tipo di utenza', () => {
    const f = agreementForecast(
      base({
        orders: [order(1, '2026-01-01', '2026-12-31', [1, 2, 3]), order(9, '2026-01-01', null, [1])],
        utilities: [
          utility(1, { consumptions: history }),
          utility(2),
          utility(3, { hard_type: HardTypeEnum.WATER, consumptions: history }),
        ],
        committed: [],
      }),
    );
    expect(f.warnings).toEqual({
      orders_without_dates: [9],
      utilities_without_data: [2],
      utilities_other_type: [3],
    });
    expect(rowOf(f, 7, 2026)).toMatchObject({ utilities: 2, to_invoice: 3650, coverage: 0.5 });
  });

  it('nessun ordine con date: nessun orizzonte, righe solo dall’impegnato', () => {
    const f = agreementForecast(base({ orders: [order(1, null, null, [1])] }));
    expect(f.horizon).toBeNull();
    expect(f.rows).toEqual([
      {
        chapter_id: 7,
        year: 2026,
        utilities: 0,
        invoiced: 0,
        to_invoice: 0,
        total: 0,
        committed: 3000,
        remaining: 2690,
        difference: 2690,
        coverage: 0,
        shortfall: null,
        alert: null,
      },
    ]);
  });
});
