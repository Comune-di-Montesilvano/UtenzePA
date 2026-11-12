import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
  buildDailyConsumption,
  type ConsumptionRecord,
  fromDay,
  toDay,
} from '@apis/utility-consumptions/consumption-calculator';
import { SupplyEventType } from '@apis/utility-supply/enum/supply-event-type.enum';
import {
  activeIntervals,
  type DayInterval,
  holderIntervals,
  subtractIntervals,
  type SupplyEventLike,
} from '@apis/utility-supply/supply-state';
import { lineShare, spendOnDays, type StatsLine } from './chapter-utility-stats';
import { lineFiscalYear } from './line-year';

// Fabbisogno della convenzione CONSIP (roadmap voce 24). Funzioni pure,
// niente DB: per ogni utenza e ogni giorno coperto da un ordine della
// convenzione, il giorno già fatturato vale la quota reale della riga, quello
// non fatturato il consumo atteso × il costo unitario. Nessun calcolo passa
// dal CIG.

// Avviso: ammanco oltre il 5 % dell'impegnato e oltre 200 €, con almeno il
// 60 % dei giorni calcolati da dati reali o dallo storico dei consumi.
export const SHORTFALL_MIN_RATIO = 0.05;
export const SHORTFALL_MIN_AMOUNT = 200;
export const MIN_ALERT_COVERAGE = 0.6;
// Andamento dei consumi sull'anno prima: finestra e limiti.
export const TREND_DAYS = 90;
export const TREND_MIN = 0.7;
export const TREND_MAX = 1.5;
// Costo unitario proposto: ultimi giorni con fatture.
export const PRICE_DAYS = 92;
// Anni all'indietro in cui cercare lo stesso giorno nello storico.
const HISTORY_YEARS = 5;

export interface ForecastOrder {
  id: number;
  draft: boolean;
  closed: boolean;
  // supply_start_date / supply_expiry_date ('AAAA-MM-GG').
  start: string | null;
  end: string | null;
  utility_ids: number[];
}

export interface ForecastUtility {
  id: number;
  utility_code: string | null;
  hard_type: HardTypeEnum | null;
  chapter_id: number | null;
  estimated_annual_consumption: number | null;
  lines: StatsLine[];
  consumptions: ConsumptionRecord[];
  events: SupplyEventLike[];
}

// Origine della stima dei giorni non fatturati di un'utenza.
export type ForecastSource = 'history' | 'annual' | 'spend' | 'none';

// Durata massima credibile di un ordine (20 anni): oltre è un errore di
// battitura nella scadenza e l'ordine conta come senza date (il calcolo
// scorre i giorni uno a uno).
const MAX_ORDER_DAYS = 7305;

const hasBothDates = (o: ForecastOrder): boolean =>
  !!o.start && !!o.end && o.end >= o.start && toDay(o.end) - toDay(o.start) <= MAX_ORDER_DAYS;

// Periodi a carico del Comune: attiva e non volturata. Senza attivazioni né
// cessazioni registrate l'utenza conta come attiva da sempre (stessa regola
// di out-of-period.ts): la maggior parte delle utenze non ha storico.
function chargeIntervals(events: SupplyEventLike[]): DayInterval[] {
  const hasActivity = events.some(
    (e) =>
      !e.deleted &&
      !e.cancelled_on &&
      (e.date_unknown || !!e.effective_on) &&
      (e.type === SupplyEventType.ACTIVATION || e.type === SupplyEventType.CESSATION),
  );
  const active = hasActivity ? activeIntervals(events) : [{ start: null, end: null }];
  return subtractIntervals(active, holderIntervals(events));
}

// Giorni (dall'epoch, ordinati) in cui l'utenza conta nella convenzione:
// unione dei periodi degli ordini che la contengono, meno i giorni non a
// carico del Comune. Ordini senza una delle due date: ignorati.
export function utilityDays(orders: ForecastOrder[], utility: ForecastUtility): number[] {
  const intervals = chargeIntervals(utility.events).map((i) => ({
    start: i.start === null ? -Infinity : toDay(i.start),
    end: i.end === null ? Infinity : toDay(i.end),
  }));
  const days = new Set<number>();
  for (const o of orders) {
    if (!hasBothDates(o) || !o.utility_ids.includes(utility.id)) continue;
    const end = toDay(o.end as string);
    for (let d = toDay(o.start as string); d <= end; d++) {
      if (intervals.some((i) => d >= i.start && d <= i.end)) days.add(d);
    }
  }
  return [...days].sort((a, b) => a - b);
}

// Stesso giorno dell'anno prima; il 29 febbraio diventa 28.
export function sameDayLastYear(day: number): number {
  const iso = fromDay(day);
  const year = Number(iso.slice(0, 4)) - 1;
  const rest = iso.slice(4) === '-02-29' ? '-02-28' : iso.slice(4);
  return toDay(`${year}${rest}`);
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

// Andamento: consumo degli ultimi TREND_DAYS giorni con dati (fino a today)
// diviso per quello degli stessi giorni dell'anno prima, sommato sulle utenze
// (per utenza è troppo rumoroso). Contano solo i giorni che hanno il dato in
// entrambi gli anni. Limitato a [TREND_MIN, TREND_MAX]; 1 senza dati.
export function consumptionTrend(dailies: Map<number, number>[], today: number): number {
  let last = -Infinity;
  for (const daily of dailies) {
    for (const d of daily.keys()) if (d <= today && d > last) last = d;
  }
  if (last === -Infinity) return 1;
  let now = 0;
  let before = 0;
  for (const daily of dailies) {
    for (let d = last - TREND_DAYS + 1; d <= last; d++) {
      const current = daily.get(d);
      const previous = daily.get(sameDayLastYear(d));
      if (current === undefined || previous === undefined) continue;
      now += current;
      before += previous;
    }
  }
  if (now <= 0 || before <= 0) return 1;
  return clamp(now / before, TREND_MIN, TREND_MAX);
}

const lineDay = (l: StatsLine): number => toDay(l.period_end ?? l.period_start ?? l.invoice_date);

const hasPeriod = (l: StatsLine): boolean =>
  !!l.period_start && !!l.period_end && toDay(l.period_end) >= toDay(l.period_start);
const periodOf = (l: StatsLine): { s: number; e: number } => ({
  s: toDay(l.period_start as string),
  e: toDay(l.period_end as string),
});

// Giorni della finestra coperti dal periodo di almeno una riga.
function billedDays(lines: StatsLine[], w: { start: number; end: number }): Set<number> {
  const days = new Set<number>();
  for (const l of lines) {
    if (!hasPeriod(l)) continue;
    const p = periodOf(l);
    for (let d = Math.max(p.s, w.start); d <= Math.min(p.e, w.end); d++) days.add(d);
  }
  return days;
}

// Costo unitario tutto incluso: spesa delle righe / consumo, sugli ultimi
// PRICE_DAYS giorni che finiscono all'ultimo giorno coperto da una riga (mai
// dopo oggi: una fine periodo sbagliata nel futuro svuoterebbe la finestra),
// contando solo i giorni fatturati che hanno anche il consumo (un giorno con
// consumo ma senza bolletta abbasserebbe il prezzo). null senza righe o
// senza consumo.
export function proposedPrice(
  utilities: { lines: StatsLine[]; daily: Map<number, number> }[],
  today: number,
): number | null {
  let last = -Infinity;
  for (const u of utilities) for (const l of u.lines) last = Math.max(last, lineDay(l));
  if (last === -Infinity) return null;
  last = Math.min(last, today);
  const w = { start: last - PRICE_DAYS + 1, end: last };
  let spend = 0;
  let consumption = 0;
  for (const u of utilities) {
    const billed = billedDays(u.lines, w);
    const days = new Set<number>();
    for (const d of billed) {
      const value = u.daily.get(d) ?? 0;
      if (value > 0) {
        days.add(d);
        consumption += value;
      }
    }
    if (days.size) spend += spendOnDays(u.lines, days, w);
  }
  return consumption > 0 && spend > 0 ? spend / consumption : null;
}

// Spesa media giornaliera dalle righe degli ultimi 365 giorni: importo
// diviso i giorni coperti dalle righe (non 365: le bollette arrivano in
// ritardo); righe senza periodo: diviso 365. null senza righe nel periodo;
// mai negativa (solo note di credito = nessuna spesa attesa).
export function dailySpend(lines: StatsLine[], today: number): number | null {
  const w = { start: today - 364, end: today };
  let total = 0;
  let any = false;
  const covered = new Set<number>();
  for (const l of lines) {
    const share = lineShare(l, w);
    if (l.period_start && l.period_end && toDay(l.period_end) >= toDay(l.period_start)) {
      const s = Math.max(toDay(l.period_start), w.start);
      const e = Math.min(toDay(l.period_end), w.end);
      if (e < s) continue;
      for (let d = s; d <= e; d++) covered.add(d);
    } else if (lineDay(l) < w.start || lineDay(l) > w.end) {
      continue;
    }
    any = true;
    total += share;
  }
  if (!any) return null;
  return Math.max(0, total / (covered.size || 365));
}

// Origine della stima dell'utenza e costo previsto di un giorno non
// fatturato. In ordine: storico (consumo reale del giorno se c'è, altrimenti
// dello stesso giorno dell'anno più recente con il dato × andamento),
// presunto annuo diviso sui giorni, sola spesa (media giornaliera delle
// righe, senza passare dal prezzo), nessun dato. Senza prezzo, o con lo
// storico tutto a zero (quote fisse), resta la sola spesa.
export function expectedDayCost(
  utility: ForecastUtility,
  daily: Map<number, number>,
  ctx: { today: number; trend: number; price: number | null },
): {
  source: ForecastSource;
  cost: (day: number) => number;
  consumption: (day: number) => number | null;
} {
  const { price, trend, today } = ctx;
  let historyTotal = 0;
  for (const v of daily.values()) historyTotal += v;
  const annual = Number(utility.estimated_annual_consumption ?? 0);
  const perDayAnnual = annual > 0 ? annual / 365 : null;

  if (price !== null && historyTotal > 0) {
    const mean = historyTotal / daily.size;
    const consumption = (day: number): number => {
      const real = daily.get(day);
      if (real !== undefined) return real;
      let d = day;
      for (let i = 0; i < HISTORY_YEARS; i++) {
        d = sameDayLastYear(d);
        const value = daily.get(d);
        if (value !== undefined) return value * trend;
      }
      return perDayAnnual ?? mean;
    };
    return { source: 'history', consumption, cost: (day) => consumption(day) * price };
  }
  if (price !== null && perDayAnnual !== null) {
    return {
      source: 'annual',
      consumption: () => perDayAnnual,
      cost: () => perDayAnnual * price,
    };
  }
  const spend = dailySpend(utility.lines, today);
  if (spend !== null) return { source: 'spend', consumption: () => null, cost: () => spend };
  return { source: 'none', consumption: () => null, cost: () => 0 };
}

export interface ForecastCommitted {
  chapter_id: number | null;
  year: number;
  // Somma delle annualità con importo.
  committed: number;
  // committed − quote già spese su quelle annualità (COMMITMENT_SPENT).
  remaining: number;
  // Annualità senza importo.
  without_amount: number;
}

export interface ForecastInput {
  today: number;
  orders: ForecastOrder[];
  utilities: ForecastUtility[];
  committed: ForecastCommitted[];
  manualPrices: Partial<Record<HardTypeEnum, number>>;
}

export interface ForecastUtilityRow {
  id: number;
  utility_code: string | null;
  hard_type: HardTypeEnum | null;
  chapter_id: number | null;
  source: ForecastSource;
  // Conta solo grazie a ordini in bozza.
  from_draft: boolean;
  lines_without_period: boolean;
  years: {
    year: number;
    invoiced: number;
    to_invoice: number;
    expected_consumption: number | null;
  }[];
}

export interface ForecastRow {
  chapter_id: number | null;
  year: number;
  utilities: number;
  invoiced: number;
  to_invoice: number;
  total: number;
  committed: number;
  remaining: number;
  // remaining − to_invoice: negativa = manca.
  difference: number;
  // Quota dei giorni calcolati da fatture o dallo storico dei consumi.
  coverage: number;
  // Importo mancante, solo se scatta l'avviso.
  shortfall: number | null;
  alert: 'short' | 'insufficient_data' | null;
}

export interface ForecastPrice {
  hard_type: HardTypeEnum;
  proposed: number | null;
  manual: number | null;
  used: number | null;
  trend: number;
}

export interface AgreementForecast {
  horizon: { start: string; end: string } | null;
  prices: ForecastPrice[];
  rows: ForecastRow[];
  utilities: ForecastUtilityRow[];
  warnings: {
    orders_without_dates: number[];
    utilities_without_data: number[];
    // Tipi senza convenzione di fornitura (acqua, connettività): esclusi.
    utilities_other_type: number[];
    // Annualità di impegno senza importo: contano come niente impegnato.
    commitments_without_amount: { chapter_id: number | null; year: number; count: number }[];
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const round6 = (n: number): number => Math.round(n * 1000000) / 1000000;
const yearOfDay = (day: number): number => new Date(day * 86_400_000).getUTCFullYear();

// Tipi di utenza che passano da una convenzione di fornitura.
const FORECAST_TYPES: HardTypeEnum[] = [HardTypeEnum.LIGHT, HardTypeEnum.GAS];

// Regola dell'avviso su una riga dell'esercizio in corso.
export function shortfall(
  row: Pick<ForecastRow, 'committed' | 'difference' | 'coverage' | 'to_invoice'>,
): { shortfall: number | null; alert: ForecastRow['alert'] } {
  const missing = -row.difference;
  if (missing <= SHORTFALL_MIN_AMOUNT || missing <= SHORTFALL_MIN_RATIO * row.committed) {
    return { shortfall: null, alert: null };
  }
  if (row.coverage < MIN_ALERT_COVERAGE) return { shortfall: null, alert: 'insufficient_data' };
  return { shortfall: round2(missing), alert: 'short' };
}

interface Bucket {
  chapter_id: number | null;
  year: number;
  utilities: Set<number>;
  invoiced: number;
  toInvoice: number;
  days: number;
  goodDays: number;
}

type TypeContext = { today: number; trend: number; price: number | null };

const keyOf = (chapter: number | null, year: number): string => `${chapter ?? ''}|${year}`;

export function agreementForecast(input: ForecastInput): AgreementForecast {
  const { today, orders, committed, manualPrices } = input;
  const currentYear = yearOfDay(today);
  const dated = orders.filter(hasBothDates);
  const horizon = dated.length
    ? {
        start: dated.map((o) => o.start as string).sort()[0],
        end: dated.map((o) => o.end as string).sort()[dated.length - 1],
      }
    : null;

  const isForecastType = (u: ForecastUtility): boolean =>
    !!u.hard_type && FORECAST_TYPES.includes(u.hard_type);
  const otherType = input.utilities.filter((u) => !isForecastType(u));
  const utilities = input.utilities.filter(isForecastType);
  const dailies = new Map(utilities.map((u) => [u.id, buildDailyConsumption(u.consumptions)]));
  const dailyOf = (u: ForecastUtility): Map<number, number> =>
    dailies.get(u.id) as Map<number, number>;

  // Prezzo e andamento per tipo, sull'insieme delle utenze della convenzione.
  const prices: ForecastPrice[] = [];
  const ctxByType = new Map<HardTypeEnum, TypeContext>();
  for (const type of FORECAST_TYPES) {
    const ofType = utilities.filter((u) => u.hard_type === type);
    if (!ofType.length) continue;
    const trend = consumptionTrend(ofType.map(dailyOf), today);
    const proposed = proposedPrice(
      ofType.map((u) => ({ lines: u.lines, daily: dailyOf(u) })),
      today,
    );
    const manual = manualPrices[type] ?? null;
    const used = manual ?? proposed;
    prices.push({
      hard_type: type,
      proposed: proposed === null ? null : round6(proposed),
      manual,
      used: used === null ? null : round6(used),
      trend: round4(trend),
    });
    ctxByType.set(type, { today, trend, price: used });
  }

  const buckets = new Map<string, Bucket>();
  const bucket = (chapter: number | null, year: number): Bucket => {
    const key = keyOf(chapter, year);
    let b = buckets.get(key);
    if (!b) {
      b = {
        chapter_id: chapter,
        year,
        utilities: new Set(),
        invoiced: 0,
        toInvoice: 0,
        days: 0,
        goodDays: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  const utilityRows: ForecastUtilityRow[] = [];
  const withoutData: number[] = [];

  for (const u of utilities) {
    const days = utilityDays(orders, u);
    if (!days.length) continue;
    const inDays = new Set(days);
    // Un ordine chiuso non riceve più fatture: i suoi giorni contano per il
    // fatturato ma non si prevedono (di solito le utenze sono passate a un
    // altro ordine, che li prevede già).
    const openDays = new Set(
      utilityDays(
        orders.filter((o) => !o.closed),
        u,
      ),
    );
    const expected = expectedDayCost(
      u,
      dailyOf(u),
      ctxByType.get(u.hard_type as HardTypeEnum) as TypeContext,
    );
    if (expected.source === 'none') withoutData.push(u.id);

    // Quota reale di ogni giorno coperto da una riga con periodo completo;
    // le righe senza periodo vanno nel fatturato dell'esercizio e non
    // coprono giorni.
    const billed = new Map<number, number>();
    const loose = new Map<number, number>();
    for (const l of u.lines) {
      const amount = Number(l.amount);
      if (hasPeriod(l)) {
        const { s, e } = periodOf(l);
        const perDay = amount / (e - s + 1);
        for (let d = s; d <= e; d++) {
          if (inDays.has(d)) billed.set(d, (billed.get(d) ?? 0) + perDay);
        }
      } else if (inDays.has(lineDay(l))) {
        const year = lineFiscalYear(l.period_start, l.period_end, l.invoice_date);
        loose.set(year, (loose.get(year) ?? 0) + amount);
      }
    }
    const withoutPeriod = loose.size > 0;
    // Una riga senza periodo rende incerti i giorni del suo esercizio, non
    // degli altri.
    const uncertain = (year: number): boolean => loose.has(year);
    const estimated = expected.source === 'history' || expected.source === 'annual';

    const perYear = new Map<
      number,
      { invoiced: number; toInvoice: number; consumption: number | null }
    >();
    const yearOf = (year: number) => {
      let y = perYear.get(year);
      if (!y) {
        y = { invoiced: 0, toInvoice: 0, consumption: null };
        perYear.set(year, y);
      }
      return y;
    };
    for (const d of days) {
      const year = yearOfDay(d);
      const real = billed.get(d);
      if (real === undefined && !openDays.has(d)) continue;
      const y = yearOf(year);
      const b = bucket(u.chapter_id, year);
      b.days++;
      if (real !== undefined) {
        y.invoiced += real;
        if (!uncertain(year)) b.goodDays++;
      } else if (year >= currentYear) {
        // Esercizi chiusi: nessuna proiezione.
        y.toInvoice += expected.cost(d);
        const consumption = expected.consumption(d);
        if (consumption !== null) y.consumption = (y.consumption ?? 0) + consumption;
        if (estimated && !uncertain(year)) b.goodDays++;
      }
    }
    for (const [year, amount] of loose) yearOf(year).invoiced += amount;

    for (const [year, y] of perYear) {
      const b = bucket(u.chapter_id, year);
      b.utilities.add(u.id);
      b.invoiced += y.invoiced;
      b.toInvoice += y.toInvoice;
    }
    utilityRows.push({
      id: u.id,
      utility_code: u.utility_code,
      hard_type: u.hard_type,
      chapter_id: u.chapter_id,
      source: expected.source,
      from_draft: !dated.some((o) => !o.draft && o.utility_ids.includes(u.id)),
      lines_without_period: withoutPeriod,
      years: [...perYear.entries()]
        .sort(([a], [b]) => a - b)
        .map(([year, y]) => ({
          year,
          invoiced: round2(y.invoiced),
          to_invoice: round2(y.toInvoice),
          expected_consumption: y.consumption === null ? null : round2(y.consumption),
        })),
    });
  }

  // Capitoli con impegni della convenzione ma senza utenze: riga comunque.
  const committedBy = new Map(committed.map((c) => [keyOf(c.chapter_id, c.year), c] as const));
  for (const c of committed) bucket(c.chapter_id, c.year);

  const rows: ForecastRow[] = [...buckets.values()]
    .sort((a, b) => b.year - a.year || (a.chapter_id ?? Infinity) - (b.chapter_id ?? Infinity))
    .map((b) => {
      const c = committedBy.get(keyOf(b.chapter_id, b.year));
      const toInvoice = round2(b.toInvoice);
      const invoiced = round2(b.invoiced);
      const remaining = round2(Number(c?.remaining ?? 0));
      const base = {
        chapter_id: b.chapter_id,
        year: b.year,
        utilities: b.utilities.size,
        invoiced,
        to_invoice: toInvoice,
        total: round2(invoiced + toInvoice),
        committed: round2(Number(c?.committed ?? 0)),
        remaining,
        difference: round2(remaining - toInvoice),
        coverage: b.days ? round4(b.goodDays / b.days) : 0,
      };
      // Avviso solo sull'esercizio in corso.
      const alert: { shortfall: number | null; alert: ForecastRow['alert'] } =
        b.year === currentYear ? shortfall(base) : { shortfall: null, alert: null };
      return { ...base, ...alert };
    });

  return {
    horizon,
    prices,
    rows,
    utilities: utilityRows,
    warnings: {
      orders_without_dates: orders.filter((o) => !hasBothDates(o)).map((o) => o.id),
      utilities_without_data: withoutData,
      utilities_other_type: otherType.map((u) => u.id),
      commitments_without_amount: committed
        .filter((c) => c.without_amount > 0)
        .map((c) => ({ chapter_id: c.chapter_id, year: c.year, count: c.without_amount })),
    },
  };
}
