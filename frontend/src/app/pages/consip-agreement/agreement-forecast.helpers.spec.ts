import {
  forecastNotices, requestPlan, requestUtilities, simulateMoves, SOURCE_LABEL, unitLabel,
} from './agreement-forecast.helpers';
import type {AgreementForecast, AnnualRow, ForecastUtilityRow} from './agreement-forecast.model';

const annual = (over: Partial<AnnualRow>): AnnualRow => ({
  chapter_id: 7, year: 2027, utilities: 1, billed: 0, expected: 0, coverage: 1, ...over,
});

const forecastWith = (over: Partial<AgreementForecast>): AgreementForecast => ({
  horizon: null, billed_until: null, annual: [], prices: [], rows: [], utilities: [],
  warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [], commitments_without_amount: []},
  computed_at: '2026-11-12T10:00:00.000Z', chapters: [], shared_commitments: [], shares_without_lines: [],
  budgets: [], chapter_other_utilities: [], chapter_needs: [], agreements: [], ...over,
});

describe('requestPlan', () => {
  // Capitolo 7: stanziati 30 nel 2027, spesi 45 nel 2026 → servono 48: +18.
  // Capitolo 8: stanziati 100, servono 60: avanzano 40. Capitolo 9: nessuno stanziamento.
  const f = forecastWith({
    annual: [
      annual({chapter_id: 7, year: 2026, billed: 40, expected: 5}),
      annual({chapter_id: 7, year: 2027, expected: 48}),
      annual({chapter_id: 8, year: 2027, expected: 60, coverage: 0.4}),
      annual({chapter_id: 9, year: 2027, expected: 10}),
      annual({chapter_id: 7, year: 2025, billed: 999}),
    ],
    budgets: [
      {chapter_id: 7, year: 2026, budget: 35},
      {chapter_id: 7, year: 2027, budget: 30},
      {chapter_id: 8, year: 2027, budget: 100},
      {chapter_id: 9, year: 2027, budget: null},
    ],
    chapter_other_utilities: [{chapter_id: 8, count: 2}],
  });

  it('per capitolo: spesa dell’anno prima, serve nell’esercizio, differenza con lo stanziamento', () => {
    const plan = requestPlan(f, 2027);
    expect(plan.rows.map(r => [r.chapter_id, r.base_budget, r.base_total, r.budget, r.need, r.request, r.uncertain, r.other_utilities]))
      .toEqual([
        [7, 35, 45, 30, 48, 18, false, 0],
        [8, null, 0, 100, 60, -40, true, 2],
        [9, null, 0, null, 10, null, false, 0],
      ]);
    expect(plan.rows[0]).toMatchObject({own: 48, own_utilities: 1, agreements: []});
    expect(plan.totals).toEqual({
      base_budget: 35, base_total: 45, budget: 130, need: 118, increase: 18, increase_chapters: 1,
      decrease: 40, decrease_chapters: 1, without_budget: 1,
    });
  });
});

describe('requestPlan con più convenzioni sul capitolo', () => {
  it('serve = tutto il capitolo (chapter_needs), quota di questa convenzione e nomi delle altre', () => {
    const f = forecastWith({
      annual: [annual({chapter_id: 7, year: 2027, expected: 48, coverage: 0.9})],
      chapter_needs: [
        {chapter_id: 7, year: 2027, utilities: 5, billed: 0, expected: 80, own_utilities: 1, own: 48, agreements: [5]},
      ],
      agreements: [{id: 5, label: 'Gas naturale 16'}],
      budgets: [{chapter_id: 7, year: 2027, budget: 70}],
    });
    expect(requestPlan(f, 2027).rows[0]).toMatchObject({
      need: 80, request: 10, own: 48, own_utilities: 1, utilities: 5, agreements: ['Gas naturale 16'], uncertain: false,
    });
  });
});

describe('simulateMoves', () => {
  const plan = (requests: [number, number | null][]) =>
    requests.map(([chapter, request]) => ({chapter_id: chapter, request}) as never);

  it('l’avanzo più grande copre la mancanza più grande; il resto è fabbisogno extra', () => {
    const m = simulateMoves(plan([[1, 50], [2, 20], [3, -30], [4, -10], [5, null]]), new Set());
    expect(m.moves).toEqual([
      {from: 3, to: 1, amount: 30},
      {from: 4, to: 1, amount: 10},
    ]);
    expect(m.extra).toBe(30);
    expect(m.leftover).toBe(0);
    expect(m.taken.get(3)).toBe(30);
    expect(m.given.get(1)).toBe(40);
  });

  it('capitolo escluso: il suo avanzo non si usa; avanzo che resta', () => {
    const m = simulateMoves(plan([[1, 5], [3, -30], [4, -10]]), new Set([3]));
    expect(m.moves).toEqual([{from: 4, to: 1, amount: 5}]);
    expect(m.extra).toBe(0);
    expect(m.leftover).toBe(5);
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

describe('requestUtilities', () => {
  const utility = (over: Partial<ForecastUtilityRow>): ForecastUtilityRow => ({
    id: 1, utility_code: 'IT001', hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false, years: [], annual: [], ...over,
  });

  it('utenze del capitolo con spesa dell’anno prima e fabbisogno, dalla più cara', () => {
    const list = [
      utility({id: 1, annual: [{year: 2026, billed: 10, expected: 2}, {year: 2027, billed: 0, expected: 15}]}),
      utility({id: 2, source: 'annual', from_draft: true, annual: [{year: 2027, billed: 0, expected: 30}]}),
      utility({id: 3, chapter_id: 8, annual: [{year: 2027, billed: 0, expected: 99}]}),
      utility({id: 4, annual: []}),
    ];
    expect(requestUtilities(list, 7, 2027)).toEqual([
      {id: 2, utility_code: 'IT001', source: 'annual', from_draft: true, base_billed: 0, base_expected: 0, need: 30},
      {id: 1, utility_code: 'IT001', source: 'history', from_draft: false, base_billed: 10, base_expected: 2, need: 15},
    ]);
  });
});

describe('forecastNotices', () => {
  const u = (id: number, over: Partial<ForecastUtilityRow> = {}): ForecastUtilityRow => ({
    id, utility_code: `IT00${id}`, hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false, years: [], annual: [], ...over,
  });
  const forecast = (over: Partial<AgreementForecast> = {}): AgreementForecast => ({
    horizon: null, billed_until: null, annual: [], prices: [], rows: [], utilities: [],
    warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [], commitments_without_amount: []},
    computed_at: '2026-11-12T10:00:00.000Z', chapters: [{id: 7, label: '1234/0 — Luce scuole'}],
    shared_commitments: [], shares_without_lines: [], budgets: [], chapter_other_utilities: [], chapter_needs: [], agreements: [], ...over,
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
