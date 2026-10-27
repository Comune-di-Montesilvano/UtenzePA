import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
  buildDailyConsumption,
  type ConsumptionRecord,
  fromDay,
  toDay,
} from '@apis/utility-consumptions/consumption-calculator';
import { CONSUMPTION_UNIT } from '@apis/utility-consumptions/consumption-unit';

// Statistiche delle utenze di un capitolo in un periodo (scheda capitolo →
// Utenze). Funzioni pure, niente DB: spesa dalle righe di fattura ripartite
// pro rata sui giorni del periodo della riga, consumo dalla mappa giornaliera
// dei consumi (stime superate escluse), costo unitario = spesa dei giorni con
// consumo / consumo.

// 'last12' = ultimi 12 mesi fino a oggi, altrimenti un anno.
export type StatsPeriod = 'last12' | number;

// Giorni dall'epoch, estremi inclusi.
export interface DayWindow {
  start: number;
  end: number;
}

export interface StatsLine {
  amount: number;
  period_start: string | null;
  period_end: string | null;
  invoice_date: string;
}

export interface StatsUtility {
  id: number;
  utility_code: string | null;
  type_name: string | null;
  hard_type: HardTypeEnum | null;
  active: boolean;
  lines: StatsLine[];
  consumptions: ConsumptionRecord[];
}

export type OutlierReason = 'unit_cost' | 'change';

export interface UtilityStats {
  id: number;
  utility_code: string | null;
  type_name: string | null;
  hard_type: HardTypeEnum | null;
  active: boolean;
  spend: number;
  previous_spend: number;
  // (spesa − precedente) / precedente; null senza spesa precedente, se
  // cessata o se le righe non coprono abbastanza giorni in uno dei due periodi.
  change: number | null;
  // Righe di fattura che coprono almeno MIN_COVERAGE di entrambi i periodi.
  comparable: boolean;
  unit: string | null;
  consumption: number | null;
  unit_cost: number | null;
  outliers: OutlierReason[];
}

export interface TypeStats {
  hard_type: HardTypeEnum | null;
  unit: string | null;
  utilities: number;
  spend: number;
  consumption: number | null;
  unit_cost: number | null;
}

export interface ChapterUtilityStats {
  period: { start: string; end: string; previous_start: string; previous_end: string };
  summary: {
    spend: number;
    previous_spend: number;
    // Solo sulle utenze confrontabili, quante in compared_utilities.
    change: number | null;
    compared_utilities: number;
    active_utilities: number;
    average_per_active: number | null;
    types: TypeStats[];
  };
  utilities: UtilityStats[];
}

// Soglie «fuori norma» (decise con l'utente, spec del 27/10/2026).
export const UNIT_COST_MEDIAN_FACTOR = 2;
export const SPEND_CHANGE_LIMIT = 0.5;
// Sotto questo numero di utenze dello stesso tipo la mediana non dice nulla.
const MIN_FOR_MEDIAN = 3;
// Quota dei giorni del periodo coperta dalle righe di fattura sotto la quale
// la spesa è incompleta (fatture senza righe per utenza, bollette mancanti).
export const MIN_COVERAGE = 0.8;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const change = (now: number, before: number): number | null =>
  before > 0 ? round4((now - before) / before) : null;

export function periodWindows(
  period: StatsPeriod,
  today: number,
): { current: DayWindow; previous: DayWindow } {
  if (period === 'last12') {
    return {
      current: { start: today - 364, end: today },
      previous: { start: today - 729, end: today - 365 },
    };
  }
  const start = toDay(`${period}-01-01`);
  const yearEnd = toDay(`${period}-12-31`);
  const end = Math.min(yearEnd, today);
  // Anno in corso: lo stesso tratto dell'anno prima, non l'anno intero.
  const previousStart = toDay(`${period - 1}-01-01`);
  const previousEnd =
    end === yearEnd ? toDay(`${period - 1}-12-31`) : toDay(`${period - 1}${fromDay(end).slice(4)}`);
  return { current: { start, end }, previous: { start: previousStart, end: previousEnd } };
}

// Parte dell'importo della riga che cade nella finestra: pro rata sui giorni
// del periodo; senza periodo completo conta un giorno solo (fine, inizio o
// data fattura).
export function lineShare(line: StatsLine, w: DayWindow): number {
  const amount = Number(line.amount);
  if (line.period_start && line.period_end) {
    const s = toDay(line.period_start);
    const e = toDay(line.period_end);
    if (e >= s) {
      const overlap = Math.min(e, w.end) - Math.max(s, w.start) + 1;
      return overlap > 0 ? (amount * overlap) / (e - s + 1) : 0;
    }
  }
  const d = toDay(line.period_end ?? line.period_start ?? line.invoice_date);
  return d >= w.start && d <= w.end ? amount : 0;
}

// Spesa dei soli giorni con consumo: ogni riga conta per i suoi giorni coperti.
function spendOnDays(lines: StatsLine[], days: Set<number>, w: DayWindow): number {
  let total = 0;
  for (const line of lines) {
    const amount = Number(line.amount);
    if (
      line.period_start &&
      line.period_end &&
      toDay(line.period_end) >= toDay(line.period_start)
    ) {
      const s = toDay(line.period_start);
      const e = toDay(line.period_end);
      let covered = 0;
      for (let d = Math.max(s, w.start); d <= Math.min(e, w.end); d++) if (days.has(d)) covered++;
      total += (amount * covered) / (e - s + 1);
    } else {
      const d = toDay(line.period_end ?? line.period_start ?? line.invoice_date);
      if (days.has(d)) total += amount;
    }
  }
  return total;
}

// Giorni della finestra coperti dal periodo di almeno una riga.
function coveredDays(lines: StatsLine[], w: DayWindow): number {
  const days = new Set<number>();
  for (const line of lines) {
    if (!line.period_start || !line.period_end) continue;
    const s = Math.max(toDay(line.period_start), w.start);
    const e = Math.min(toDay(line.period_end), w.end);
    for (let d = s; d <= e; d++) days.add(d);
  }
  return days.size;
}

function median(values: number[]): number | null {
  if (values.length < MIN_FOR_MEDIAN) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function chapterUtilityStats(
  utilities: StatsUtility[],
  period: StatsPeriod,
  today: number,
): ChapterUtilityStats {
  const { current, previous } = periodWindows(period, today);
  const types = new Map<string, TypeStats & { costSpend: number }>();

  const rows = utilities.map((u) => {
    const sum = (w: DayWindow) => u.lines.reduce((t, l) => t + lineShare(l, w), 0);
    const spend = sum(current);
    const previousSpend = sum(previous);
    const covered = (w: DayWindow) =>
      coveredDays(u.lines, w) >= MIN_COVERAGE * (w.end - w.start + 1);
    const comparable = covered(current) && covered(previous);
    const unit = u.hard_type ? CONSUMPTION_UNIT[u.hard_type] : null;

    let consumption: number | null = null;
    let costSpend = 0;
    if (unit) {
      const daily = buildDailyConsumption(u.consumptions);
      const days = new Set<number>();
      let total = 0;
      for (const [d, v] of daily) {
        if (d < current.start || d > current.end) continue;
        days.add(d);
        total += v;
      }
      if (days.size) {
        consumption = total;
        costSpend = spendOnDays(u.lines, days, current);
      }
    }

    const key = String(u.hard_type);
    const t = types.get(key) ?? {
      hard_type: u.hard_type,
      unit,
      utilities: 0,
      spend: 0,
      consumption: unit ? 0 : null,
      unit_cost: null,
      costSpend: 0,
    };
    t.utilities++;
    t.spend += spend;
    if (consumption) {
      t.consumption = (t.consumption ?? 0) + consumption;
      t.costSpend += costSpend;
    }
    types.set(key, t);

    const row: UtilityStats = {
      id: u.id,
      utility_code: u.utility_code,
      type_name: u.type_name,
      hard_type: u.hard_type,
      active: u.active,
      spend: round2(spend),
      previous_spend: round2(previousSpend),
      change: u.active && comparable ? change(spend, previousSpend) : null,
      comparable,
      unit,
      consumption: consumption === null ? null : round2(consumption),
      unit_cost: consumption ? round4(costSpend / consumption) : null,
      outliers: [],
    };
    return row;
  });

  for (const r of rows) {
    if (r.change !== null && Math.abs(r.change) > SPEND_CHANGE_LIMIT) r.outliers.push('change');
  }
  for (const key of types.keys()) {
    const same = rows.filter((r) => String(r.hard_type) === key && r.unit_cost !== null);
    const m = median(same.map((r) => r.unit_cost as number));
    if (m === null) continue;
    for (const r of same) {
      if ((r.unit_cost as number) > m * UNIT_COST_MEDIAN_FACTOR) r.outliers.unshift('unit_cost');
    }
  }

  const spend = rows.reduce((t, r) => t + r.spend, 0);
  const previousSpend = rows.reduce((t, r) => t + r.previous_spend, 0);
  const compared = rows.filter((r) => r.comparable);
  const comparedSpend = compared.reduce((t, r) => t + r.spend, 0);
  const comparedPrevious = compared.reduce((t, r) => t + r.previous_spend, 0);
  const active = rows.filter((r) => r.active);
  const activeSpend = active.reduce((t, r) => t + r.spend, 0);

  return {
    period: {
      start: fromDay(current.start),
      end: fromDay(current.end),
      previous_start: fromDay(previous.start),
      previous_end: fromDay(previous.end),
    },
    summary: {
      spend: round2(spend),
      previous_spend: round2(previousSpend),
      change: change(comparedSpend, comparedPrevious),
      compared_utilities: compared.length,
      active_utilities: active.length,
      average_per_active: active.length ? round2(activeSpend / active.length) : null,
      types: [...types.values()].map(({ costSpend, ...t }) => ({
        ...t,
        spend: round2(t.spend),
        consumption: t.consumption === null ? null : round2(t.consumption),
        unit_cost: t.consumption ? round4(costSpend / t.consumption) : null,
      })),
    },
    utilities: rows.sort((a, b) => b.spend - a.spend),
  };
}
