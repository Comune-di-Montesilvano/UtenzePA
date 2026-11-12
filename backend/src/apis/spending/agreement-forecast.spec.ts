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
  consumptionTrend,
  dailySpend,
  expectedDayCost,
  type ForecastOrder,
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
