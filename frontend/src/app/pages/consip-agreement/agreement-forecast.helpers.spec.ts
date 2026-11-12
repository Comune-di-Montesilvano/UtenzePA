import {differenceTone, SOURCE_LABEL, unitLabel, utilitiesOf, yearGroups} from './agreement-forecast.helpers';
import type {ForecastRow, ForecastUtilityRow} from './agreement-forecast.model';

const row = (over: Partial<ForecastRow>): ForecastRow => ({
  chapter_id: 7, year: 2026, utilities: 1, invoiced: 0, to_invoice: 0, total: 0, committed: 0, remaining: 0,
  difference: 0, coverage: 1, shortfall: null, alert: null, ...over,
});

describe('yearGroups', () => {
  const rows = [
    row({chapter_id: 7, year: 2026, utilities: 3, invoiced: 100, to_invoice: 50, total: 150, committed: 120, remaining: 20, difference: -30, coverage: 1, shortfall: 30, alert: 'short'}),
    row({chapter_id: 8, year: 2026, utilities: 1, invoiced: 10.1, to_invoice: 5.2, total: 15.3, committed: 40, remaining: 29.9, difference: 24.7, coverage: 0.5}),
    row({chapter_id: 7, year: 2027, utilities: 2, to_invoice: 200, total: 200, difference: -200}),
    row({chapter_id: 7, year: 2025, utilities: 2, invoiced: 80, total: 80}),
  ];

  it('anni decrescenti, aperto solo quello in corso', () => {
    const groups = yearGroups(rows, 2026);
    expect(groups.map(g => g.year)).toEqual([2027, 2026, 2025]);
    expect(groups.map(g => g.open)).toEqual([false, true, false]);
    expect(groups[1].rows).toHaveLength(2);
  });

  it('senza righe nell’anno in corso si apre il più recente', () => {
    expect(yearGroups(rows.filter(r => r.year !== 2026), 2026).map(g => g.open)).toEqual([true, false]);
  });

  it('totali = somma delle colonne, copertura media pesata sulle utenze', () => {
    const totals = yearGroups(rows, 2026)[1].totals;
    expect(totals).toEqual({
      chapter_id: null, year: 2026, utilities: 4, invoiced: 110.1, to_invoice: 55.2, total: 165.3,
      committed: 160, remaining: 49.9, difference: -5.3, coverage: 0.875, shortfall: 30, alert: null,
    });
  });

  it('totali senza ammanco: shortfall null', () => {
    expect(yearGroups(rows, 2026)[0].totals.shortfall).toBeNull();
  });

  it('nessuna riga: nessun gruppo', () => {
    expect(yearGroups([], 2026)).toEqual([]);
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
