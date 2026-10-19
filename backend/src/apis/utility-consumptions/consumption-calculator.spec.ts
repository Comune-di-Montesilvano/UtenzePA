import {
  buildDailyBands,
  buildDailyConsumption,
  computeActual,
  computeMonthlySeries,
  computeSeasonalEstimate,
  currentMeterReading,
  dataGaps,
  ConsumptionRecord,
  decideEstimate,
  fromDay,
  normalizeByKind,
  readingDeltas,
  supersededIds,
  toDay,
  todayDay,
  validateBands,
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
  describe('todayDay', () => {
    it('usa il giorno di calendario italiano, non quello del server UTC', () => {
      // 22:30 UTC del 29/09 = 00:30 del 30/09 a Roma (ora legale)
      expect(todayDay(new Date('2026-09-29T22:30:00Z'))).toBe(toDay('2026-09-30'));
      // 23:30 UTC del 15/01 = 00:30 del 16/01 a Roma (ora solare)
      expect(todayDay(new Date('2026-01-15T23:30:00Z'))).toBe(toDay('2026-01-16'));
    });
  });

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
      expect(computeActual(daily, TODAY)).toMatchObject({ actual: 100, coverageDays: 10 });
    });

    it('valori decimal come stringa (mysql2) sommati come numeri', () => {
      const daily = buildDailyConsumption([reading(1, '2026-01-01', '1000.000'), reading(2, '2026-01-11', '1100.500')]);
      expect(computeActual(daily, TODAY).actual).toBeCloseTo(100.5);
    });

    it('intervallo a cavallo della finestra: solo la quota dentro', () => {
      // finestra = 2025-09-30 .. 2026-09-29 (ultimo dato oggi); intervallo 2025-09-21..2025-10-10, 10/giorno
      const daily = buildDailyConsumption([
        reading(1, '2025-09-20', 0),
        reading(2, '2025-10-10', 200),
        period(3, '2026-09-29', '2026-09-29', 0),
      ]);
      expect(computeActual(daily, TODAY)).toMatchObject({ actual: 110, coverageDays: 12 });
    });

    it('cambio matricola: nessun intervallo tra contatori diversi', () => {
      const daily = buildDailyConsumption([
        reading(1, '2026-01-01', 1000, 'A'),
        reading(2, '2026-01-11', 5, 'B'),
        reading(3, '2026-01-21', 105, 'B'),
      ]);
      expect(computeActual(daily, TODAY)).toMatchObject({ actual: 100, coverageDays: 10 });
    });

    it('sostituzione contatore con chiusura e apertura nella stessa data, inserite in ordine qualsiasi', () => {
      const records = [
        reading(1, '2026-01-01', 100, 'A'),
        reading(5, '2026-01-10', 0, 'B'),
        reading(6, '2026-01-10', 5000, 'A'),
        reading(7, '2026-01-20', 50, 'B'),
      ];
      expect(computeActual(buildDailyConsumption(records), TODAY)).toMatchObject({ actual: 4950, coverageDays: 19 });
      const deltas = readingDeltas(records);
      expect(deltas.get(6)).toBe(4900);
      expect(deltas.get(7)).toBe(50);
      expect(deltas.get(5)).toBeNull();
    });

    it('lettura di altra matricola strettamente in mezzo: intervallo scartato', () => {
      const records = [reading(1, '2026-01-01', 0, 'A'), reading(2, '2026-01-05', 0, 'B'), reading(3, '2026-01-10', 90, 'A')];
      expect(computeActual(buildDailyConsumption(records), TODAY).actual).toBe(0);
      expect(readingDeltas(records).get(3)).toBeNull();
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
      expect(computeActual(daily, TODAY)).toMatchObject({ actual: 130, coverageDays: 10 });
    });

    it('nessun dato: effettivo 0, copertura 0', () => {
      expect(computeActual(buildDailyConsumption([]), TODAY)).toMatchObject({ actual: 0, coverageDays: 0 });
    });

    it('finestra fino all’ultimo dato: i giorni dopo (bolletta non arrivata) non contano', () => {
      // dati 01/07/2025–31/08/2026 senza maggio–giugno 2026, oggi 16/10/2026
      const daily = buildDailyConsumption([
        period(1, '2025-07-01', '2026-04-30', 304),
        period(2, '2026-07-01', '2026-08-31', 62),
      ]);
      expect(computeActual(daily, toDay('2026-10-16'))).toEqual({
        actual: 304 - 62 + 62,
        coverageDays: 365 - 61,
        windowStart: '2025-09-01',
        windowEnd: '2026-08-31',
      });
    });

    it('ultimo dato più vecchio di un anno: finestra fino a oggi', () => {
      const daily = buildDailyConsumption([period(1, '2024-01-01', '2024-01-10', 50)]);
      expect(computeActual(daily, TODAY)).toEqual({
        actual: 0,
        coverageDays: 0,
        windowStart: '2025-09-30',
        windowEnd: '2026-09-29',
      });
    });
  });

  describe('dataGaps', () => {
    it('buchi tra primo e ultimo dato; non prima del primo né dopo l’ultimo', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-07-01', '2026-04-30', 304),
        period(2, '2026-07-01', '2026-08-31', 62),
        period(3, '2026-09-02', '2026-09-10', 9),
      ]);
      expect(dataGaps(daily, TODAY)).toEqual([
        { start: '2026-05-01', end: '2026-06-30' },
        { start: '2026-09-01', end: '2026-09-01' },
      ]);
    });

    it('giorni fuori dai periodi attivi: non sono buchi', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-07-01', '2025-12-31', 184),
        period(2, '2026-03-01', '2026-08-31', 184),
      ]);
      // Cessata il 2026-01-15, riattivata il 2026-02-10: restano i buchi
      // 2026-01-01..2026-01-15 e 2026-02-10..2026-02-28.
      expect(
        dataGaps(daily, TODAY, [
          { start: null, end: '2026-01-15' },
          { start: '2026-02-10', end: null },
        ]),
      ).toEqual([
        { start: '2026-01-01', end: '2026-01-15' },
        { start: '2026-02-10', end: '2026-02-28' },
      ]);
      // Cessazione tra i due periodi attivi: nessun buco.
      expect(
        dataGaps(daily, TODAY, [
          { start: null, end: '2025-12-31' },
          { start: '2026-03-01', end: null },
        ]),
      ).toEqual([]);
      // Senza periodi: comportamento invariato.
      expect(dataGaps(daily, TODAY)).toEqual([{ start: '2026-01-01', end: '2026-02-28' }]);
    });

    it('nessun dato o dati continui: nessun buco', () => {
      expect(dataGaps(buildDailyConsumption([]), TODAY)).toEqual([]);
      expect(dataGaps(buildDailyConsumption([period(1, '2026-01-01', '2026-08-31', 10)]), TODAY)).toEqual([]);
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
      expect(computeActual(daily, TODAY)).toMatchObject({ actual: 0, coverageDays: 0 });
      expect(computeSeasonalEstimate(daily, TODAY)).toBe(1825);
    });

    it('nessun dato: null', () => {
      expect(computeSeasonalEstimate(buildDailyConsumption([]), TODAY)).toBeNull();
    });
  });

  describe('computeMonthlySeries', () => {
    it('mesi dal primo dato fino al corrente + 12 futuri, stima stagionale sui futuri', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-09-30', '2026-03-29', 362),
        period(2, '2026-03-30', '2026-09-29', 184),
      ]);
      const series = computeMonthlySeries(daily, TODAY);
      expect(series).toHaveLength(25);
      expect(series[0].month).toBe('2025-09');
      expect(series[12].month).toBe('2026-09');
      expect(series[24].month).toBe('2027-09');

      const jan26 = series.find((p) => p.month === '2026-01');
      expect(jan26).toEqual({ month: '2026-01', actual: 62, covered_days: 31, days: 31, estimated: 0 });

      const oct26 = series.find((p) => p.month === '2026-10');
      expect(oct26).toEqual({ month: '2026-10', actual: 0, covered_days: 0, days: 31, estimated: 62 });
      expect(series.find((p) => p.month === '2027-01')?.estimated).toBe(62);
    });

    it('giorni tra l’ultimo dato e oggi (bolletta non ancora arrivata): stimati', () => {
      // 2/giorno fino al 15/09/2026, oggi 29/09: 16–29 senza dato ma dopo l'ultimo dato
      const daily = buildDailyConsumption([period(1, '2025-09-16', '2026-09-15', 730)]);
      const sep26 = computeMonthlySeries(daily, TODAY).find((p) => p.month === '2026-09');
      expect(sep26).toEqual({ month: '2026-09', actual: 30, covered_days: 15, days: 30, estimated: 30 });
    });

    it('buco nei dati prima dell’ultimo dato: resta mancante, non stimato', () => {
      const daily = buildDailyConsumption([
        period(1, '2025-09-16', '2026-07-31', 638),
        period(2, '2026-09-01', '2026-09-29', 58),
      ]);
      const aug26 = computeMonthlySeries(daily, TODAY).find((p) => p.month === '2026-08');
      expect(aug26).toEqual({ month: '2026-08', actual: 0, covered_days: 0, days: 31, estimated: 0 });
    });

    it('fasce per mese: reale da periodi e da coppie di letture, stimato ripartito per quota', () => {
      const records: ConsumptionRecord[] = [
        // agosto 2026: periodo con fasce (F1 60, F2 30, F3 10 su 100)
        { ...period(1, '2026-08-01', '2026-08-31', 100), consumption_f1: 60, consumption_f2: 30, consumption_f3: 10 },
        // luglio 2026: letture con totalizzatori, consumo 50 = F1 30 + F2 15 + F3 5
        { ...reading(2, '2026-06-30', 1000), consumption_f1: 600, consumption_f2: 300, consumption_f3: 100 },
        { ...reading(3, '2026-07-31', 1050), consumption_f1: 630, consumption_f2: 315, consumption_f3: 105 },
        // settembre 2026: periodo senza fasce (tutto «non ripartito»)
        period(4, '2026-09-01', '2026-09-29', 29),
      ];
      const series = computeMonthlySeries(buildDailyConsumption(records), TODAY, buildDailyBands(records));
      const aug = series.find((p) => p.month === '2026-08');
      expect(aug?.bands).toEqual({ F1: 60, F2: 30, F3: 10 });
      const jul = series.find((p) => p.month === '2026-07');
      expect(jul?.bands).toEqual({ F1: 30, F2: 15, F3: 5 });
      const sep = series.find((p) => p.month === '2026-09');
      expect(sep?.bands).toEqual({});
      // quota su 150 kWh ripartiti: F1 90/150, F2 45/150, F3 15/150
      const oct = series.find((p) => p.month === '2026-10');
      expect(oct?.estimated_bands?.F1).toBeCloseTo(oct!.estimated * 0.6 * (150 / 179), 1);
      const sumEst = Object.values(oct?.estimated_bands ?? {}).reduce((s, v) => s + v, 0);
      expect(sumEst).toBeLessThanOrEqual(oct!.estimated + 0.01);
    });

    it('senza fasce: nessuna chiave bands', () => {
      const records = [period(1, '2026-08-01', '2026-08-31', 100)];
      const aug = computeMonthlySeries(buildDailyConsumption(records), TODAY, buildDailyBands(records)).find((p) => p.month === '2026-08');
      expect(aug).not.toHaveProperty('bands');
    });

    it('nessun dato: solo mese corrente e futuri, a 0', () => {
      const series = computeMonthlySeries(buildDailyConsumption([]), TODAY);
      expect(series).toHaveLength(13);
      expect(series[0].month).toBe('2026-09');
      expect(series.every((p) => p.actual === 0 && p.estimated === 0)).toBe(true);
    });

    it('storico oltre 24 mesi: al massimo 24 mesi passati', () => {
      const series = computeMonthlySeries(buildDailyConsumption([period(1, '2020-01-01', '2026-09-29', 2465)]), TODAY);
      expect(series).toHaveLength(36);
      expect(series[0].month).toBe('2024-10');
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

  describe('currentMeterReading', () => {
    it('ultima data: a parità preferisce la matricola nuova (apertura) alla chiusura della vecchia', () => {
      const records = [reading(1, '2026-01-01', 100, 'A'), reading(5, '2026-01-10', 0, 'B'), reading(6, '2026-01-10', 5000, 'A')];
      expect(currentMeterReading(records)?.meter_number).toBe('B');
    });

    it('nessuna lettura: undefined', () => {
      expect(currentMeterReading([period(1, '2026-01-01', '2026-01-10', 5)])).toBeUndefined();
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

  describe('validateBands', () => {
    type Bands = Partial<Record<'consumption_f0' | 'consumption_f1' | 'consumption_f2' | 'consumption_f3', number | string | null>>;
    const period = (consumption: number, f: Bands): ConsumptionRecord => ({
      kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption, ...f,
    });

    it('nessuna fascia: nessun controllo', () => {
      expect(validateBands(period(100, {}))).toBeNull();
    });

    it('somma esatta (decimal come stringa)', () => {
      expect(validateBands(period(100, { consumption_f1: '50.000', consumption_f2: 30, consumption_f3: 20 }))).toBeNull();
    });

    it('scarto entro 1 kWh ammesso, fasce vuote = 0', () => {
      expect(validateBands(period(100.8, { consumption_f1: 100, consumption_f2: null }))).toBeNull();
    });

    it('scarto oltre 1 kWh: messaggio con i due totali', () => {
      expect(validateBands(period(15000, { consumption_f1: 10000, consumption_f2: 2000 }))).toBe(
        'La somma delle fasce (12.000 kWh) non coincide con il consumo del periodo (15.000 kWh).',
      );
    });

    it('lettura: totalizzatori che sommano al valore letto', () => {
      expect(validateBands({ kind: ConsumptionKind.READING, reading_value: 15000, consumption_f1: 8000, consumption_f2: 4000, consumption_f3: 3000 })).toBeNull();
    });

    it('lettura: totalizzatori che non sommano al valore letto', () => {
      expect(validateBands({ kind: ConsumptionKind.READING, reading_value: 15000, consumption_f1: 8000, consumption_f2: 4000 })).toBe(
        'La somma dei totalizzatori di fascia (12.000 kWh) non coincide con il valore letto (15.000 kWh).',
      );
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
        consumption_f0: null,
        consumption_f1: null,
        consumption_f2: null,
        consumption_f3: null,
        reactive_penalty: null,
        is_estimated: false,
        notes: null,
      });
    });

    it('periodo elettrico: fasce e penale mantenute', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, consumption_f1: 10, reactive_penalty: true }, true);
      expect(r).toMatchObject({ consumption_f1: 10, consumption_f0: null, reactive_penalty: true });
    });

    it('periodo non elettrico: fasce e penale azzerate', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: 10, consumption_f1: 10, reactive_penalty: true }, false);
      expect(r).toMatchObject({ consumption_f1: null, reactive_penalty: null });
    });

    it('lettura elettrica: totalizzatori F1–F3 mantenuti, F0 e penale azzerati', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: 10, meter_number: 'M', consumption_f0: 1, consumption_f2: 4, reactive_penalty: false }, true);
      expect(r).toMatchObject({ consumption_f0: null, consumption_f2: 4, reactive_penalty: null });
    });

    it('lettura non elettrica: totalizzatori azzerati', () => {
      const r = normalizeByKind({ kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: 10, meter_number: 'M', consumption_f2: 4 }, false);
      expect(r).toMatchObject({ consumption_f2: null });
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
      expect(validateConsumption(reading(9, '2026-02-01', 900), others, TODAY)).toMatch(/precedente \(1000 del 01\/01\/2026\)/);
    });

    it('lettura superiore alla successiva stessa matricola rifiutata', () => {
      expect(validateConsumption(reading(9, '2026-02-01', 1400), others, TODAY)).toMatch(/successiva/);
    });

    it('totalizzatore di fascia inferiore alla lettura precedente stessa matricola rifiutato', () => {
      const prev = { ...reading(1, '2026-01-01', 1000), consumption_f1: 600, consumption_f2: 400 };
      const cand = { ...reading(9, '2026-02-01', 1100), consumption_f1: 590, consumption_f2: 510 };
      expect(validateConsumption(cand, [prev], TODAY)).toBe(
        'Totalizzatore F1 inferiore alla lettura precedente (600 del 01/01/2026) per la stessa matricola.',
      );
    });

    it('totalizzatore di fascia superiore alla lettura successiva rifiutato', () => {
      const next = { ...reading(2, '2026-03-01', 1300), consumption_f3: 100 };
      const cand = { ...reading(9, '2026-02-01', 1100), consumption_f3: 150 };
      expect(validateConsumption(cand, [next], TODAY)).toMatch(/Totalizzatore F3 superiore alla lettura successiva/);
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
      expect(validateConsumption(period(9, '2026-05-31', '2026-06-10', 10), others, TODAY)).toMatch(/sovrappone.*01\/05\/2026 – 31\/05\/2026/);
    });

    it('periodo con fine prima dell’inizio rifiutato', () => {
      expect(validateConsumption(period(9, '2026-06-10', '2026-06-01', 10), others, TODAY)).toMatch(/inizio/);
    });

    it('date anteriori al 1990 rifiutate', () => {
      expect(validateConsumption(reading(9, '1989-12-31', 10), [], TODAY)).toMatch(/1990/);
      expect(validateConsumption(period(9, '1989-12-01', '1990-01-10', 10), [], TODAY)).toMatch(/1990/);
    });

    it('periodo adiacente ammesso', () => {
      expect(validateConsumption(period(9, '2026-06-01', '2026-06-30', 10), others, TODAY)).toBeNull();
    });
  });
});

// Rilevazioni stimate: il dato reale prevale, la stima conta finché non arriva.
describe('letture stimate', () => {
  const est = (r: ConsumptionRecord): ConsumptionRecord => ({ ...r, is_estimated: true });
  const at = (daily: Map<number, number>, iso: string): number => daily.get(toDay(iso)) ?? 0;

  it('stimata tra due reali: ignorata', () => {
    const records = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 300)), reading(3, '2026-03-01', 200)];
    const deltas = readingDeltas(records);
    expect(deltas.get(2)).toBeNull();
    expect(deltas.get(3)).toBe(100);
    const daily = buildDailyConsumption(records);
    expect(at(daily, '2026-01-15')).toBeCloseTo(100 / 59, 6);
    expect(at(daily, '2026-02-15')).toBeCloseTo(100 / 59, 6);
    expect([...supersededIds(records)]).toEqual([2]);
  });

  it("stime dopo l'ultima reale contano a catena", () => {
    const records = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 130)), est(reading(3, '2026-03-01', 160))];
    const deltas = readingDeltas(records);
    expect(deltas.get(2)).toBe(30);
    expect(deltas.get(3)).toBe(30);
    expect(supersededIds(records).size).toBe(0);
  });

  it('reale e stimata stessa data: conta la reale', () => {
    const records = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 150)), reading(3, '2026-02-01', 140)];
    expect(readingDeltas(records).get(3)).toBe(40);
    expect([...supersededIds(records)]).toEqual([2]);
  });

  it('cambio contatore con stime sul vecchio', () => {
    const records = [
      reading(1, '2026-01-01', 10, 'A'),
      est(reading(2, '2026-02-01', 50, 'A')),
      reading(3, '2026-02-15', 0, 'B'),
      reading(4, '2026-03-15', 30, 'B'),
    ];
    const deltas = readingDeltas(records);
    expect(deltas.get(2)).toBe(40);
    expect(deltas.get(4)).toBe(30);
    expect(supersededIds(records).size).toBe(0);
    expect(currentMeterReading(records)?.id).toBe(4);
  });

  it('stima del vecchio contatore non spezza le coppie reali del nuovo', () => {
    const records = [
      reading(1, '2026-01-01', 10, 'A'),
      reading(3, '2026-02-15', 0, 'B'),
      est(reading(2, '2026-03-01', 60, 'A')),
      reading(4, '2026-03-15', 30, 'B'),
    ];
    expect(readingDeltas(records).get(4)).toBe(30);
  });

  it('priorità: coppia reale prima del periodo stimato', () => {
    const records = [est(period(1, '2026-01-01', '2026-01-31', 310)), reading(2, '2026-01-11', 0), reading(3, '2026-01-21', 200)];
    const daily = buildDailyConsumption(records);
    expect(at(daily, '2026-01-05')).toBeCloseTo(10, 6);
    expect(at(daily, '2026-01-11')).toBeCloseTo(10, 6);
    expect(at(daily, '2026-01-15')).toBeCloseTo(20, 6);
    expect(at(daily, '2026-01-21')).toBeCloseTo(20, 6);
    expect(at(daily, '2026-01-25')).toBeCloseTo(10, 6);
  });

  it('priorità: periodo stimato prima della coppia stimata', () => {
    const records = [est(period(1, '2026-01-01', '2026-01-31', 310)), reading(2, '2026-01-11', 0), est(reading(3, '2026-01-21', 200))];
    expect(at(buildDailyConsumption(records), '2026-01-15')).toBeCloseTo(10, 6);
  });

  it('priorità: periodo reale prima del periodo stimato sovrapposto', () => {
    const records = [period(1, '2026-01-01', '2026-01-31', 31), est(period(2, '2026-01-20', '2026-02-09', 210))];
    const daily = buildDailyConsumption(records);
    expect(at(daily, '2026-01-25')).toBeCloseTo(1, 6);
    expect(at(daily, '2026-02-05')).toBeCloseTo(10, 6);
    expect(supersededIds(records).size).toBe(0);
  });

  it('periodo stimato superato del tutto', () => {
    const records = [est(period(1, '2026-01-12', '2026-01-21', 999)), reading(2, '2026-01-11', 0), reading(3, '2026-01-21', 100)];
    expect([...supersededIds(records)]).toEqual([1]);
    expect(at(buildDailyConsumption(records), '2026-01-15')).toBeCloseTo(10, 6);
  });

  it('periodo stimato superato solo in parte: conta e non è superato', () => {
    const records = [est(period(1, '2026-01-01', '2026-01-31', 310)), reading(2, '2026-01-11', 0), reading(3, '2026-01-21', 100)];
    expect(supersededIds(records).size).toBe(0);
  });

  it('fasce: stessa priorità', () => {
    const r = (id: number, date: string, value: number, f1: number): ConsumptionRecord => ({
      ...reading(id, date, value),
      consumption_f1: f1,
    });
    const records = [r(1, '2026-01-01', 100, 50), est(r(2, '2026-02-01', 300, 250)), r(3, '2026-03-01', 200, 100)];
    expect(buildDailyBands(records).F1?.get(toDay('2026-02-15'))).toBeCloseTo(50 / 59, 6);
  });

  describe('validazione', () => {
    it('reale più bassa della stima precedente accettata', () => {
      const others = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 300))];
      expect(validateConsumption(reading(undefined, '2026-03-01', 200), others, TODAY)).toBeNull();
    });

    it('reale confrontata solo con le reali successive', () => {
      const others = [reading(1, '2026-01-01', 100), est(reading(2, '2026-03-01', 120))];
      expect(validateConsumption(reading(undefined, '2026-02-01', 200), others, TODAY)).toBeNull();
    });

    it('stimata più bassa della valida precedente rifiutata', () => {
      expect(validateConsumption(est(reading(undefined, '2026-02-01', 80)), [reading(1, '2026-01-01', 100)], TODAY)).toContain(
        'Lettura inferiore alla precedente',
      );
      const others = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 150))];
      expect(validateConsumption(est(reading(undefined, '2026-03-01', 120)), others, TODAY)).toContain(
        'Lettura inferiore alla precedente (150',
      );
    });

    it('stessa data: reale+stimata ammessa, doppioni rifiutati', () => {
      const dup = 'Lettura già presente per questa matricola in questa data.';
      expect(validateConsumption(est(reading(undefined, '2026-02-01', 120)), [reading(1, '2026-02-01', 100)], TODAY)).toBeNull();
      expect(validateConsumption(reading(undefined, '2026-02-01', 100), [reading(1, '2026-02-01', 100)], TODAY)).toBe(dup);
      expect(
        validateConsumption(est(reading(undefined, '2026-02-01', 100)), [est(reading(1, '2026-02-01', 100))], TODAY),
      ).toBe(dup);
    });

    it('periodi: reale+stimato sovrapposti ammessi, stimato+stimato rifiutati', () => {
      expect(
        validateConsumption(est(period(undefined, '2026-01-10', '2026-02-10', 5)), [period(1, '2026-01-01', '2026-01-31', 5)], TODAY),
      ).toBeNull();
      expect(
        validateConsumption(
          est(period(undefined, '2026-01-10', '2026-02-10', 5)),
          [est(period(1, '2026-01-01', '2026-01-31', 5))],
          TODAY,
        ),
      ).toContain('Il periodo si sovrappone a un periodo già inserito');
    });

    it('modifica da stimata a reale rivalidata', () => {
      const others = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 50))];
      expect(validateConsumption(reading(2, '2026-02-01', 50), others, TODAY)).toContain('Lettura inferiore alla precedente');
    });
  });

  it('normalizeByKind conserva il flag', () => {
    expect(normalizeByKind(est(reading(1, '2026-01-01', 1))).is_estimated).toBe(true);
    expect(normalizeByKind(period(1, '2026-01-01', '2026-01-31', 1)).is_estimated).toBe(false);
  });
});

// Revisione finale: stime contraddette dal dato reale e stime del contatore sostituito.
describe('letture stimate: casi della revisione', () => {
  const est = (r: ConsumptionRecord): ConsumptionRecord => ({ ...r, is_estimated: true });

  it('stima più bassa di una reale precedente inserita dopo: superata, nessun consumo negativo', () => {
    const records = [reading(1, '2026-01-01', 100), est(reading(2, '2026-03-01', 120)), reading(3, '2026-02-01', 200)];
    expect([...supersededIds(records)]).toEqual([2]);
    expect(readingDeltas(records).get(2)).toBeNull();
  });

  it('stima più bassa della stima precedente: consumo non calcolabile, mai negativo', () => {
    const records = [reading(1, '2026-01-01', 100), est(reading(2, '2026-02-01', 150)), est(reading(3, '2026-03-01', 130))];
    expect(readingDeltas(records).get(3)).toBeNull();
  });

  it('stima del vecchio contatore dopo l’apertura del nuovo: superata, matricola attuale invariata', () => {
    const records = [
      reading(1, '2026-01-01', 10, 'A'),
      reading(2, '2026-02-15', 40, 'A'),
      reading(3, '2026-02-15', 0, 'B'),
      est(reading(4, '2026-03-31', 60, 'A')),
    ];
    expect([...supersededIds(records)]).toEqual([4]);
    expect(currentMeterReading(records)?.id).toBe(3);
    expect(buildDailyConsumption(records).get(toDay('2026-03-01')) ?? 0).toBe(0);
  });
});
