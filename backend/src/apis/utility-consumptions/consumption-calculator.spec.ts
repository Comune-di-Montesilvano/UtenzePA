import {
  buildDailyConsumption,
  computeActual,
  computeMonthlySeries,
  computeSeasonalEstimate,
  ConsumptionRecord,
  decideEstimate,
  fromDay,
  normalizeByKind,
  readingDeltas,
  toDay,
  validateConsumption,
} from './consumption-calculator';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';

const TODAY = toDay('2026-09-29');

const reading = (id: number, date: string, value: number | string, meter = 'M1'): ConsumptionRecord => ({
  id,
  kind: ConsumptionKind.READING,
  reading_date: date,
  reading_value: value,
  meter_number: meter,
});

const period = (id: number, start: string, end: string, consumption: number | string): ConsumptionRecord => ({
  id,
  kind: ConsumptionKind.PERIOD,
  period_start: start,
  period_end: end,
  consumption,
});

describe('consumption-calculator', () => {
  describe('toDay/fromDay', () => {
    it('round-trip su date di calendario', () => {
      expect(fromDay(toDay('2026-02-28'))).toBe('2026-02-28');
      expect(toDay('2026-03-01') - toDay('2026-02-28')).toBe(1);
    });
  });

  describe('buildDailyConsumption + computeActual', () => {
    it('letture consecutive stessa matricola: consumo distribuito sui giorni (a, b]', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', 1000), reading(2, '2026-01-11', 1100)]);
      expect(daily.get(toDay('2026-01-01'))).toBeUndefined();
      expect(daily.get(toDay('2026-01-02'))).toBeCloseTo(10);
      expect(daily.get(toDay('2026-01-11'))).toBeCloseTo(10);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 100, coverageDays: 10 });
    });

    it('valori decimal come stringa (mysql2) sommati come numeri', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', '1000.000'), reading(2, '2026-01-11', '1100.500')]);
      expect(computeActual(daily, TODAY).actual).toBeCloseTo(100.5);
    });

    it('intervallo a cavallo della finestra: solo la quota dentro', () => {
      // finestra = 2025-09-30 .. 2026-09-29; intervallo 2025-09-21..2025-10-10, 10/giorno
      const daily = buildDailyConsumption([reading(1, '2025-09-20', 0), reading(2, '2025-10-10', 200)]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 110, coverageDays: 11 });
    });

    it('cambio matricola: nessun intervallo tra contatori diversi', () => {
      const daily = buildDailyConsumption([
        reading(1, '2026-01-01', 1000, 'A'),
        reading(2, '2026-01-11', 5, 'B'),
        reading(3, '2026-01-21', 105, 'B'),
      ]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 100, coverageDays: 10 });
    });

    it('matricola uguale a meno di spazi/maiuscole: stesso contatore', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', 0, ' ab12 '), reading(2, '2026-01-11', 100, 'AB12')]);
      expect(computeActual(daily, TODAY).actual).toBe(100);
    });

    it('periodo ha precedenza sulle letture nei giorni in comune', () => {
      const daily = buildDailyConsumption([
        reading(1, '2026-01-01', 0),
        reading(2, '2026-01-11', 100),
        period(3, '2026-01-05', '2026-01-06', 50),
      ]);
      expect(daily.get(toDay('2026-01-05'))).toBeCloseTo(25);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 130, coverageDays: 10 });
    });

    it('nessun dato: effettivo 0, copertura 0', () => {
      expect(computeActual(buildDailyConsumption([]), TODAY)).toEqual({ actual: 0, coverageDays: 0 });
    });
  });

  describe('computeSeasonalEstimate', () => {
    it('anno precedente coperto: stima = profilo stagionale', () => {
      // 2025-09-30..2026-03-29 = 181 giorni a 2/giorno; 2026-03-30..2026-09-29 = 184 giorni a 1/giorno
      const daily = buildDailyConsumption([
        period(1, '2025-09-30', '2026-03-29', 362),
        period(2, '2026-03-30', '2026-09-29', 184),
      ]);
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(546);
    });

    it('copertura parziale: giorni scoperti con media giornaliera', () => {
      const daily = buildDailyConsumption([period(1, '2026-07-01', '2026-07-10', 100)]);
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(3650);
    });

    it('solo storico vecchio: media su tutto lo storico', () => {
      const daily = buildDailyConsumption([period(1, '2024-01-01', '2024-01-10', 50)]);
      expect(computeActual(daily, TODAY)).toEqual({ actual: 0, coverageDays: 0 });
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(1825);
    });

    it('nessun dato: null', () => {
      expect(computeSeasonalEstimate(buildDailyConsumption([]), TODAY)).toBeNull();
    });
  });

  describe('computeMonthlySeries', () => {
    it('36 punti: 24 mesi fino al corrente + 12 futuri, stima stagionale sui futuri', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-09-30', '2026-03-29', 362),
        period(2, '2026-03-30', '2026-09-29', 184),
      ]);
      const series = computeMonthlySeries(daily, TODAY);
      expect(series).toHaveLength(36);
      expect(series[0].month).toBe('2024-10');
      expect(series[23].month).toBe('2026-09');
      expect(series[35].month).toBe('2027-09');

      const jan26 = series.find((p) => p.month === '2026-01');
      expect(jan26).toEqual({ month: '2026-01', actual: 62, covered_days: 31, days: 31, estimated: 0 });

      const oct26 = series.find((p) => p.month === '2026-10');
      expect(oct26).toEqual({ month: '2026-10', actual: 0, covered_days: 0, days: 31, estimated: 62 });
      expect(series.find((p) => p.month === '2027-01')?.estimated).toBe(62);
    });

    it('nessun dato: stime future a 0', () => {
      const series = computeMonthlySeries(buildDailyConsumption([]), TODAY);
      expect(series.every((p) => p.actual === 0 && p.estimated === 0)).toBe(true);
    });
  });

  describe('readingDeltas', () => {
    it('delta dalla lettura precedente stessa matricola, null su prima lettura e nuovo contatore', () => {
      const deltas = readingDeltas([
        reading(1, '2026-01-01', 1000, 'A'),
        reading(2, '2026-01-11', 1100, 'A'),
        reading(3, '2026-01-21', 5, 'B'),
        period(4, '2026-02-01', '2026-02-10', 30),
      ]);
      expect(deltas.get(1)).toBeNull();
      expect(deltas.get(2)).toBe(100);
      expect(deltas.get(3)).toBeNull();
      expect(deltas.has(4)).toBe(false);
    });
  });

  describe('decideEstimate', () => {
    const now = new Date('2026-09-29T10:00:00');

    it('manuale ancora valida: non toccata', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2026-01-01') }, 500, now)).toBeNull();
    });

    it('manuale scaduta con storico: passa a HISTORY', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2025-06-01') }, 500, now)).toEqual({
        estimated_annual_consumption: 500,
        estimated_consumption_source: EstimateSource.HISTORY,
        estimated_consumption_set_at: null,
      });
    });

    it('manuale scaduta senza storico: invariata', () => {
      expect(decideEstimate({ source: EstimateSource.MANUAL, setAt: new Date('2025-06-01') }, null, now)).toBeNull();
    });

    it('NONE con storico: HISTORY', () => {
      expect(decideEstimate({ source: EstimateSource.NONE, setAt: null }, 300, now)?.estimated_annual_consumption).toBe(300);
    });

    it('HISTORY: aggiornata col nuovo valore', () => {
      expect(decideEstimate({ source: EstimateSource.HISTORY, setAt: null }, 400, now)?.estimated_annual_consumption).toBe(400);
    });
  });

  describe('normalizeByKind', () => {
    it('READING: azzera i campi periodo e trimma la matricola', () => {
      expect(
        normalizeByKind({ kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: 5, meter_number: ' M1 ', period_start: '2026-01-01', consumption: 3 }),
      ).toEqual({
        kind: ConsumptionKind.READING,
        reading_date: '2026-01-01',
        reading_value: 5,
        meter_number: 'M1',
        period_start: null,
        period_end: null,
        consumption: null,
        notes: null,
      });
    });

    it('PERIOD: azzera i campi lettura', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, reading_value: 99, meter_number: 'X', notes: 'n' });
      expect(r.reading_value).toBeNull();
      expect(r.meter_number).toBeNull();
      expect(r.reading_date).toBeNull();
      expect(r.notes).toBe('n');
    });
  });

  describe('validateConsumption', () => {
    const others = [reading(1, '2026-01-01', 1000), reading(2, '2026-03-01', 1300), period(3, '2026-05-01', '2026-05-31', 50)];

    it('lettura valida tra due letture', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 1100), others, TODAY)).toBeNull();
    });

    it('lettura futura rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-10-01', 2000), others, TODAY)).toMatch(/futura/);
    });

    it('lettura inferiore alla precedente stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 900), others, TODAY)).toMatch(/precedente/);
    });

    it('lettura superiore alla successiva stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 1400), others, TODAY)).toMatch(/successiva/);
    });

    it('lettura inferiore ma con altra matricola ammessa (nuovo contatore)', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 3, 'NEW'), others, TODAY)).toBeNull();
    });

    it('stessa data e stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-01-01', 1000), others, TODAY)).toMatch(/già presente/);
    });

    it('il record in modifica non è confrontato con se stesso', () => {
      expect(validateConsumption(reading(1, '2026-01-01', 1050), others, TODAY)).toBeNull();
    });

    it('lettura senza matricola rifiutata', () => {
      expect(validateConsumption({ ...reading(9, '2026-02-01', 1100), meter_number: '  ' }, others, TODAY)).toMatch(/obbligatori/);
    });

    it('periodo sovrapposto a un altro periodo rifiutato', () => {
      expect(validateConsumption(period(9, '2026-05-31', '2026-06-10', 10), others, TODAY)).toMatch(/sovrappone/);
    });

    it('periodo con fine prima dell’inizio rifiutato', () => {
      expect(validateConsumption(period(9, '2026-06-10', '2026-06-01', 10), others, TODAY)).toMatch(/inizio/);
    });

    it('periodo adiacente ammesso', () => {
      expect(validateConsumption(period(9, '2026-06-01', '2026-06-30', 10), others, TODAY)).toBeNull();
    });
  });
});
