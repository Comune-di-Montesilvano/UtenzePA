import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
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

const hasBothDates = (o: ForecastOrder): o is ForecastOrder & { start: string; end: string } =>
  !!o.start && !!o.end && o.end >= o.start;

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
    const end = toDay(o.end);
    for (let d = toDay(o.start); d <= end; d++) {
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

// Costo unitario tutto incluso: spesa delle righe / consumo, sugli ultimi
// PRICE_DAYS giorni che finiscono all'ultimo giorno coperto da una riga,
// contando solo i giorni con consumo (stessa regola del costo unitario di
// chapter-utility-stats). null senza righe o senza consumo.
export function proposedPrice(
  utilities: { lines: StatsLine[]; daily: Map<number, number> }[],
): number | null {
  let last = -Infinity;
  for (const u of utilities) for (const l of u.lines) last = Math.max(last, lineDay(l));
  if (last === -Infinity) return null;
  const w = { start: last - PRICE_DAYS + 1, end: last };
  let spend = 0;
  let consumption = 0;
  for (const u of utilities) {
    const days = new Set<number>();
    for (let d = w.start; d <= w.end; d++) {
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
// ritardo); righe senza periodo: diviso 365. null senza righe nel periodo.
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
  return total / (covered.size || 365);
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
