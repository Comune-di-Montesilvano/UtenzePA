import {differenceTone, forecastNotices, planYears, SOURCE_LABEL, unitLabel, utilitiesOf} from './agreement-forecast.helpers';
import type {AgreementForecast, ForecastRow, ForecastUtilityRow} from './agreement-forecast.model';

const row = (over: Partial<ForecastRow>): ForecastRow => ({
  chapter_id: 7, year: 2026, utilities: 1, invoiced: 0, to_invoice: 0, total: 0, committed: 0, remaining: 0,
  difference: 0, coverage: 1, shortfall: null, alert: null, ...over,
});

describe('planYears', () => {
  const rows = [
    row({chapter_id: 7, year: 2026, invoiced: 100, to_invoice: 500, committed: 400, remaining: 120, coverage: 0.9}),
    row({chapter_id: 8, year: 2026, to_invoice: 50, committed: 300, remaining: 200, coverage: 0.4}),
    row({chapter_id: 9, year: 2026, to_invoice: 0, committed: 0, remaining: 0}),
    row({chapter_id: 7, year: 2027, to_invoice: 900, remaining: 0}),
    row({chapter_id: 7, year: 2025, invoiced: 80, committed: 80}),
  ];

  it('solo esercizio in corso e successivi, dal più vicino; aperto quello in corso', () => {
    const years = planYears(rows, 2026);
    expect(years.map(y => y.year)).toEqual([2026, 2027]);
    expect(years.map(y => y.open)).toEqual([true, false]);
  });

  it('per capitolo: da impegnare o avanzo, già speso, stima incerta sotto il 60 %', () => {
    const [y] = planYears(rows, 2026);
    expect(y.rows.map(r => [r.chapter_id, r.to_commit, r.surplus, r.spent, r.uncertain])).toEqual([
      [7, 380, 0, 280, false],
      [8, 0, 150, 100, true],
    ]);
  });

  it('capitoli senza nulla da pagare né disponibile: nascosti e contati', () => {
    expect(planYears(rows, 2026)[0].hidden).toBe(1);
  });

  it('totali dell’anno: da impegnare sommato solo sui capitoli che mancano', () => {
    expect(planYears(rows, 2026)[0].totals).toEqual({to_pay: 550, available: 320, to_commit: 380, short_chapters: 1});
  });

  it('nessun esercizio da oggi in poi: nessun gruppo', () => {
    expect(planYears(rows.filter(r => r.year < 2026), 2026)).toEqual([]);
  });
});

describe('differenceTone', () => {
  it('danger con ammanco, warning con dati insufficienti, altrimenti niente', () => {
    expect(differenceTone(row({alert: 'short'}))).toBe('danger');
    expect(differenceTone(row({alert: 'insufficient_data'}))).toBe('warning');
    expect(differenceTone(row({difference: -10}))).toBeNull();
  });
});

describe('unitLabel', () => {
  it('unità per tipo di utenza', () => {
    expect(unitLabel('LIGHT')).toBe('€/kWh');
    expect(unitLabel('GAS')).toBe('€/Smc');
    expect(unitLabel('WATER')).toBe('€/unità');
  });
});

describe('SOURCE_LABEL', () => {
  it('un’etichetta per ogni origine', () => {
    expect(SOURCE_LABEL).toEqual({
      history: 'Storico dei consumi',
      annual: 'Presunto annuo',
      spend: 'Stima dalla sola spesa',
      none: 'Senza dati',
    });
  });
});

describe('utilitiesOf', () => {
  const utility = (over: Partial<ForecastUtilityRow>): ForecastUtilityRow => ({
    id: 1, utility_code: 'IT001', hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false, years: [], ...over,
  });

  it('utenze del capitolo con dati nell’esercizio, per codice', () => {
    const list = [
      utility({id: 1, utility_code: 'IT002', years: [{year: 2026, invoiced: 10, to_invoice: 5, expected_consumption: 20}]}),
      utility({id: 2, utility_code: 'IT001', from_draft: true, source: 'annual', years: [{year: 2026, invoiced: 0, to_invoice: 7, expected_consumption: null}]}),
      utility({id: 3, chapter_id: 8, years: [{year: 2026, invoiced: 1, to_invoice: 1, expected_consumption: 1}]}),
      utility({id: 4, years: [{year: 2027, invoiced: 0, to_invoice: 9, expected_consumption: 3}]}),
    ];
    expect(utilitiesOf(list, 7, 2026)).toEqual([
      {id: 2, utility_code: 'IT001', hard_type: 'LIGHT', source: 'annual', from_draft: true, invoiced: 0, to_invoice: 7, expected_consumption: null},
      {id: 1, utility_code: 'IT002', hard_type: 'LIGHT', source: 'history', from_draft: false, invoiced: 10, to_invoice: 5, expected_consumption: 20},
    ]);
  });

  it('capitolo null = utenze senza capitolo', () => {
    const list = [utility({id: 5, chapter_id: null, years: [{year: 2026, invoiced: 0, to_invoice: 1, expected_consumption: null}]})];
    expect(utilitiesOf(list, null, 2026).map(u => u.id)).toEqual([5]);
  });
});

describe('forecastNotices', () => {
  const u = (id: number, over: Partial<ForecastUtilityRow> = {}): ForecastUtilityRow => ({
    id, utility_code: `IT00${id}`, hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false, years: [], ...over,
  });
  const forecast = (over: Partial<AgreementForecast> = {}): AgreementForecast => ({
    horizon: null, prices: [], rows: [], utilities: [],
    warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [], commitments_without_amount: []},
    computed_at: '2026-11-12T10:00:00.000Z', chapters: [{id: 7, label: '1234/0 — Luce scuole'}],
    shared_commitments: [], shares_without_lines: [], ...over,
  });

  it('niente da segnalare: nessun avviso', () => {
    expect(forecastNotices(forecast(), 2026)).toEqual([]);
  });

  it('ogni avviso dice cosa fare e su quali ordini o utenze', () => {
    const notices = forecastNotices(forecast({
      utilities: [u(1, {source: 'none'}), u(2, {lines_without_period: true}), u(3, {utility_code: null, lines_without_period: true})],
      warnings: {orders_without_dates: [12, 15], utilities_without_data: [1], utilities_other_type: [8, 9], commitments_without_amount: []},
      shared_commitments: [{id: 4, label: '2026/514/1'}],
      shares_without_lines: [{year: 2026, amount: 100}],
      rows: [{chapter_id: 7, year: 2026, utilities: 1, invoiced: 0, to_invoice: 0, total: 0, committed: 0, remaining: 0,
        difference: 0, coverage: 0.4, shortfall: null, alert: 'insufficient_data'}],
    }), 2026);
    expect(notices.slice(0, 5)).toEqual([
      'Ordini senza date di fornitura: 2 (contratti id 12, 15): completa le date nel contratto, altrimenti non entrano nel calcolo',
      'Utenze senza dati: 1 (IT001): previste a zero',
      'Utenze con righe di fattura senza periodo: 2 (IT002, id 3): l’importo è nel fatturato ma i giorni restano da pagare',
      'Utenze di altro tipo (acqua, connettività) escluse dal calcolo: 2',
      "Impegni collegati anche a un'altra convenzione: 1 (2026/514/1): il disponibile conta in entrambe, verifica che basti",
    ]);
    expect(notices[5]).toMatch(/^Fatture senza righe per utenza nel 2026: 100,00.€ di canoni o servizi, non previsti per il resto dell’anno$/);
    expect(notices).toHaveLength(6);
  });

  it('esercizi passati: niente avvisi su annualità senza importo e fatture senza righe', () => {
    const notices = forecastNotices(forecast({
      warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [],
        commitments_without_amount: [{chapter_id: 7, year: 2025, count: 1}, {chapter_id: 7, year: 2026, count: 2}]},
      shares_without_lines: [{year: 2024, amount: 50}],
    }), 2026);
    expect(notices).toEqual(['Annualità di impegno senza importo: 1234/0 — Luce scuole (2026, 2): contano come niente impegnato']);
  });

  it('elenchi lunghi: i primi dieci e il resto contato', () => {
    const many = Array.from({length: 13}, (_, i) => u(i + 1, {source: 'none'}));
    const [notice] = forecastNotices(forecast({
      utilities: many,
      warnings: {orders_without_dates: [], utilities_without_data: many.map(x => x.id), utilities_other_type: [], commitments_without_amount: []},
    }), 2026);
    expect(notice).toBe('Utenze senza dati: 13 (IT001, IT002, IT003, IT004, IT005, IT006, IT007, IT008, IT009, IT0010 e altre 3): previste a zero');
  });
});
