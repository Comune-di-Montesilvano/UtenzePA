import fc from 'fast-check';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ConsumptionKind } from '@apis/utility-consumptions/enum/consumption-kind.enum';
import { fromDay, toDay } from '@apis/utility-consumptions/consumption-calculator';
import { agreementForecast, consumptionTrend, type ForecastInput, TREND_MAX, TREND_MIN } from './agreement-forecast';

const TODAY = toDay('2026-06-15');
// Giorni tra inizio 2025 e fine 2026, come stringhe 'AAAA-MM-GG'.
const day = fc.integer({ min: toDay('2025-01-01'), max: toDay('2026-12-31') });
const period = fc.tuple(day, fc.integer({ min: 0, max: 120 })).map(([s, len]) => [fromDay(s), fromDay(s + len)] as const);

const input: fc.Arbitrary<ForecastInput> = fc
  .record({
    utilities: fc.array(
      fc.record({
        hard_type: fc.constantFrom(HardTypeEnum.LIGHT, HardTypeEnum.GAS),
        chapter_id: fc.constantFrom(7, 8, null),
        estimated_annual_consumption: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
        lines: fc.array(
          fc.record({
            amount: fc.integer({ min: -500, max: 5000 }),
            period: fc.option(period, { nil: null }),
            invoice_date: day.map(fromDay),
          }),
          { maxLength: 6 },
        ),
        consumptions: fc.array(fc.tuple(period, fc.integer({ min: 0, max: 20_000 })), { maxLength: 4 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    orders: fc.array(fc.tuple(fc.option(period, { nil: null }), fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 2 }),
    committed: fc.array(
      fc.record({
        chapter_id: fc.constantFrom(7, 8, null),
        year: fc.constantFrom(2025, 2026),
        committed: fc.integer({ min: 0, max: 50_000 }),
        spent: fc.integer({ min: 0, max: 60_000 }),
        without_amount: fc.nat(2),
      }),
      { maxLength: 3 },
    ),
    manual: fc.option(fc.double({ min: 0.01, max: 2, noNaN: true }), { nil: null }),
  })
  .map(({ utilities, orders, committed, manual }) => ({
    today: TODAY,
    utilities: utilities.map((u, i) => ({
      id: i + 1,
      utility_code: `IT${i + 1}`,
      hard_type: u.hard_type,
      chapter_id: u.chapter_id,
      estimated_annual_consumption: u.estimated_annual_consumption,
      lines: u.lines.map((l) => ({
        amount: l.amount,
        period_start: l.period ? l.period[0] : null,
        period_end: l.period ? l.period[1] : null,
        invoice_date: l.invoice_date,
      })),
      consumptions: u.consumptions.map(([[s, e], c]) => ({
        kind: ConsumptionKind.PERIOD,
        period_start: s,
        period_end: e,
        consumption: c,
      })),
      events: [],
    })),
    orders: orders.map(([p, draft, closed], i) => ({
      id: i + 1,
      draft,
      closed,
      start: p ? p[0] : null,
      end: p ? p[1] : null,
      utility_ids: utilities.map((_, j) => j + 1),
    })),
    committed: committed.map((c) => ({
      chapter_id: c.chapter_id,
      year: c.year,
      committed: c.committed,
      remaining: c.committed - c.spent,
      without_amount: c.without_amount,
    })),
    manualPrices: manual === null ? {} : { [HardTypeEnum.LIGHT]: manual },
  }));

// Ogni numero dell'output (anche annidato) è finito.
function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbers(v, `${path}[${i}]`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => numbers(v, `${path}.${k}`));
  return [];
}

describe('agreement-forecast (proprietà)', () => {
  it("l'andamento dei consumi resta sempre tra TREND_MIN e TREND_MAX", () => {
    const daily = fc
      .array(fc.tuple(day, fc.double({ min: 0, max: 10_000, noNaN: true })), { maxLength: 200 })
      .map((entries) => new Map(entries));
    fc.assert(
      fc.property(fc.array(daily, { maxLength: 3 }), (dailies) => {
        const trend = consumptionTrend(dailies, TODAY);
        expect(trend).toBeGreaterThanOrEqual(TREND_MIN);
        expect(trend).toBeLessThanOrEqual(TREND_MAX);
      }),
    );
  });

  it('con dati finiti non produce mai NaN o Infinity e la copertura sta tra 0 e 1', () => {
    fc.assert(
      fc.property(input, (i) => {
        const result = agreementForecast(i);
        for (const [path, n] of numbers(result)) {
          if (!Number.isFinite(n)) throw new Error(`${path} = ${n}`);
        }
        for (const row of result.rows) {
          expect(row.coverage).toBeGreaterThanOrEqual(0);
          expect(row.coverage).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
