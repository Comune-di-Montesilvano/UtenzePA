import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ConsumptionKind } from '@apis/utility-consumptions/enum/consumption-kind.enum';
import { toDay } from '@apis/utility-consumptions/consumption-calculator';
import {
  chapterUtilityStats,
  lineShare,
  monthWindows,
  periodWindows,
  type StatsUtility,
} from './chapter-utility-stats';

const today = toDay('2026-10-27');
const w = (start: string, end: string) => ({ start: toDay(start), end: toDay(end) });

const utility = (id: number, over: Partial<StatsUtility> = {}): StatsUtility => ({
  id,
  utility_code: `POD${id}`,
  type_name: 'Energia elettrica',
  hard_type: HardTypeEnum.LIGHT,
  active: true,
  lines: [],
  consumptions: [],
  ...over,
});

// Una bolletta mensile per ogni mese dell'anno, consumo e importo uguali.
const monthly = (year: number, amount: number, kwh: number) => {
  const lines = [];
  const consumptions = [];
  for (let m = 1; m <= 12; m++) {
    const start = `${year}-${String(m).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
    lines.push({ amount, period_start: start, period_end: end, invoice_date: end });
    consumptions.push({
      kind: ConsumptionKind.PERIOD,
      period_start: start,
      period_end: end,
      consumption: kwh,
    });
  }
  return { lines, consumptions };
};

describe('periodWindows', () => {
  it('ultimi 12 mesi fino a oggi e i 12 prima', () => {
    expect(periodWindows('last12', today)).toEqual({
      current: w('2025-10-28', '2026-10-27'),
      previous: w('2024-10-28', '2025-10-27'),
    });
  });

  it('anno chiuso intero; anno in corso fino a oggi, contro lo stesso tratto dell anno prima', () => {
    expect(periodWindows(2024, today)).toEqual({
      current: w('2024-01-01', '2024-12-31'),
      previous: w('2023-01-01', '2023-12-31'),
    });
    expect(periodWindows(2026, today)).toEqual({
      current: w('2026-01-01', '2026-10-27'),
      previous: w('2025-01-01', '2025-10-27'),
    });
  });
});

describe('monthWindows', () => {
  it('mesi del periodo tagliati sulla finestra', () => {
    expect(monthWindows(w('2025-11-28', '2026-01-10'))).toEqual([
      { month: '2025-11', window: w('2025-11-28', '2025-11-30') },
      { month: '2025-12', window: w('2025-12-01', '2025-12-31') },
      { month: '2026-01', window: w('2026-01-01', '2026-01-10') },
    ]);
  });
});

describe('lineShare', () => {
  it('riga a cavallo del periodo pro rata sui giorni', () => {
    const line = {
      amount: 100,
      period_start: '2025-12-02',
      period_end: '2026-01-10',
      invoice_date: '2026-02-01',
    };
    expect(lineShare(line, w('2026-01-01', '2026-12-31'))).toBeCloseTo(25);
    expect(lineShare(line, w('2025-01-01', '2025-12-31'))).toBeCloseTo(75);
  });

  it('senza periodo conta il giorno della fine, dell inizio o della fattura', () => {
    const year = w('2026-01-01', '2026-12-31');
    expect(
      lineShare(
        { amount: 10, period_start: null, period_end: null, invoice_date: '2026-03-01' },
        year,
      ),
    ).toBe(10);
    expect(
      lineShare(
        { amount: 10, period_start: '2025-12-01', period_end: null, invoice_date: '2026-03-01' },
        year,
      ),
    ).toBe(0);
  });
});

describe('chapterUtilityStats', () => {
  it('spesa, consumo, costo unitario e variazione per utenza e per tipo', () => {
    const a = monthly(2025, 100, 500);
    const b = monthly(2024, 50, 500);
    const stats = chapterUtilityStats(
      [utility(1, { lines: [...a.lines, ...b.lines], consumptions: a.consumptions })],
      2025,
      today,
    );
    expect(stats.utilities[0]).toMatchObject({
      spend: 1200,
      previous_spend: 600,
      change: 1,
      consumption: 6000,
      unit: 'kWh',
      unit_cost: 0.2,
      outliers: ['change'],
    });
    expect(stats.summary).toMatchObject({
      spend: 1200,
      previous_spend: 600,
      change: 1,
      active_utilities: 1,
      average_per_active: 1200,
    });
    expect(stats.summary.types).toEqual([
      {
        hard_type: HardTypeEnum.LIGHT,
        unit: 'kWh',
        utilities: 1,
        ceased: 0,
        spend: 1200,
        consumption: 6000,
        unit_cost: 0.2,
      },
    ]);
  });

  it('costo unitario oltre il doppio della mediana dello stesso tipo = fuori norma', () => {
    const cheap = monthly(2025, 100, 1000);
    const dear = monthly(2025, 100, 200);
    const stats = chapterUtilityStats(
      [
        utility(1, { ...cheap }),
        utility(2, { ...cheap }),
        utility(3, { ...cheap }),
        utility(4, { ...dear }),
      ],
      2025,
      today,
    );
    expect(stats.utilities.map((u) => u.outliers)).toEqual([[], [], [], ['unit_cost']]);
  });

  it('niente costo unitario per i tipi senza contatore; cessate senza variazione', () => {
    const lines = monthly(2025, 30, 0).lines;
    const stats = chapterUtilityStats(
      [
        utility(1, { hard_type: HardTypeEnum.INTERNET, type_name: 'Internet', lines }),
        utility(2, { active: false, lines: monthly(2024, 100, 10).lines }),
      ],
      2025,
      today,
    );
    expect(stats.utilities[0]).toMatchObject({
      spend: 360,
      consumption: null,
      unit: null,
      unit_cost: null,
    });
    expect(stats.utilities[1]).toMatchObject({
      spend: 0,
      previous_spend: 1200,
      change: null,
      outliers: [],
    });
    expect(stats.summary.active_utilities).toBe(1);
  });

  it('spesa precedente con poche righe = variazione non calcolata', () => {
    const a = monthly(2025, 100, 500);
    const b = monthly(2024, 50, 500);
    const stats = chapterUtilityStats(
      [utility(1, { lines: [...a.lines, ...b.lines.slice(0, 6)] })],
      2025,
      today,
    );
    expect(stats.utilities[0]).toMatchObject({
      previous_spend: 300,
      change: null,
      comparable: false,
      outliers: [],
    });
    expect(stats.summary).toMatchObject({ change: null, compared_utilities: 0 });
  });

  it('consumo molto sotto la mediana del tipo: costo unitario mai fuori norma', () => {
    const normal = monthly(2025, 100, 1000);
    const tiny = monthly(2025, 10, 1);
    const stats = chapterUtilityStats(
      [
        utility(1, { ...normal }),
        utility(2, { ...normal }),
        utility(3, { ...normal }),
        utility(4, { ...tiny }),
      ],
      2025,
      today,
    );
    const t = stats.utilities.find((u) => u.id === 4)!;
    expect(t).toMatchObject({ unit_cost: 10, low_consumption: true, outliers: [] });
  });

  it('per tipo conta attive e cessate a parte', () => {
    const stats = chapterUtilityStats(
      [utility(1), utility(2), utility(3, { active: false })],
      2025,
      today,
    );
    expect(stats.summary.types[0]).toMatchObject({ utilities: 2, ceased: 1 });
  });

  it('pagato sul capitolo: utenze del capitolo, di altri capitoli, senza utenza; mesi qui e altrove', () => {
    const line = (month: string, amount: number, here: number) => ({
      amount,
      period_start: `2025-${month}-01`,
      period_end: `2025-${month}-28`,
      invoice_date: `2025-${month}-28`,
      here,
    });
    const stats = chapterUtilityStats(
      [
        utility(1, { lines: [line('01', 100, 1), line('02', 100, 0)] }),
        utility(2, {
          on_chapter: false,
          chapter_label: '2000/1',
          lines: [line('03', 60, 1), line('04', 40, 0.5)],
        }),
      ],
      2025,
      today,
      [line('05', 10, 1)],
    );
    expect(stats.utilities.find((u) => u.id === 1)).toMatchObject({
      on_chapter: true,
      chapter_label: null,
      paid_here: 100,
      paid_elsewhere: 100,
      months_here: ['2025-01'],
      months_elsewhere: ['2025-02'],
    });
    expect(stats.utilities.find((u) => u.id === 2)).toMatchObject({
      on_chapter: false,
      chapter_label: '2000/1',
      spend: 100,
      paid_here: 80,
      months_here: ['2025-03', '2025-04'],
      months_elsewhere: ['2025-04'],
    });
    // Riepilogo e tipi solo sulle utenze del capitolo.
    expect(stats.summary).toMatchObject({
      spend: 200,
      active_utilities: 1,
      paid_here: { total: 190, own: 100, others: 80, without_utility: 10 },
      own_elsewhere: 100,
    });
    expect(stats.summary.types[0]).toMatchObject({ utilities: 1, spend: 200 });
  });
});
