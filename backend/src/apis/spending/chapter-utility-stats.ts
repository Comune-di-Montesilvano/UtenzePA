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
// consumo / consumo. Ogni riga porta la quota della fattura pagata sul capitolo
// (here, dalle quote d'impegno: in ragioneria la stessa utenza può passare da
// un capitolo all'altro), così le utenze di altri capitoli pagate qui entrano
// nell'elenco con i mesi pagati qui.

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
  // Quota dell'importo pagata sul capitolo (0..1); assente = 0.
  here?: number;
}

export interface StatsUtility {
  id: number;
  utility_code: string | null;
  type_name: string | null;
  hard_type: HardTypeEnum | null;
  active: boolean;
  // Utenza assegnata al capitolo in UtenzePA (assente = sì); le altre sono
  // pagate sul capitolo dalla ragioneria.
  on_chapter?: boolean;
  // Capitolo assegnato all'utenza, per quelle di altri capitoli.
  chapter_label?: string | null;
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
  // Consumo sotto LOW_CONSUMPTION_SHARE della mediana del tipo: costo unitario
  // non significativo (quota fissa su pochi kWh), mai fuori norma per costo.
  low_consumption: boolean;
  outliers: OutlierReason[];
  on_chapter: boolean;
  chapter_label: string | null;
  // Spesa del periodo pagata su questo capitolo e su altri (o non ancora
  // imputata): paid_here + paid_elsewhere = spend.
  paid_here: number;
  paid_elsewhere: number;
  // Mesi ('AAAA-MM') del periodo con spesa pagata qui / altrove.
  months_here: string[];
  months_elsewhere: string[];
}

export interface TypeStats {
  hard_type: HardTypeEnum | null;
  unit: string | null;
  // Utenze del capitolo attive e cessate.
  utilities: number;
  ceased: number;
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
    // Pagato sul capitolo nel periodo (quote d'impegno ripartite sulle righe):
    // utenze del capitolo, di altri capitoli, righe senza utenza; own_elsewhere =
    // spesa delle utenze del capitolo pagata su altri capitoli o non imputata.
    paid_here: { total: number; own: number; others: number; without_utility: number };
    own_elsewhere: number;
  };
  utilities: UtilityStats[];
}

// Soglie «fuori norma» (decise con l'utente, spec del 27/10/2026).
export const UNIT_COST_MEDIAN_FACTOR = 2;
export const SPEND_CHANGE_LIMIT = 0.5;
// Sotto questo numero di utenze dello stesso tipo la mediana non dice nulla.
const MIN_FOR_MEDIAN = 3;
// Sotto questa quota della mediana dei consumi del tipo il costo unitario non
// dice nulla (utenza attivata da poco, contatore quasi fermo).
export const LOW_CONSUMPTION_SHARE = 0.1;
// Sotto il centesimo una quota di mese non conta.
const CENT = 0.005;
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
export function spendOnDays(lines: StatsLine[], days: Set<number>, w: DayWindow): number {
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

// Mesi del periodo ('AAAA-MM'), ognuno tagliato sulla finestra.
export function monthWindows(w: DayWindow): { month: string; window: DayWindow }[] {
  const out: { month: string; window: DayWindow }[] = [];
  let [y, m] = fromDay(w.start).split('-').map(Number);
  for (;;) {
    const first = toDay(`${y}-${String(m).padStart(2, '0')}-01`);
    if (first > w.end) break;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const last = toDay(`${ny}-${String(nm).padStart(2, '0')}-01`) - 1;
    out.push({
      month: `${y}-${String(m).padStart(2, '0')}`,
      window: { start: Math.max(first, w.start), end: Math.min(last, w.end) },
    });
    y = ny;
    m = nm;
  }
  return out;
}

const hereOf = (l: StatsLine): number => Math.min(1, Math.max(0, Number(l.here ?? 0)));

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
  // Righe senza utenza pagate sul capitolo (canoni, servizi del contratto).
  unassigned: StatsLine[] = [],
): ChapterUtilityStats {
  const { current, previous } = periodWindows(period, today);
  const months = monthWindows(current);
  const types = new Map<string, TypeStats & { costSpend: number }>();

  const rows = utilities.map((u) => {
    const onChapter = u.on_chapter !== false;
    const sum = (w: DayWindow) => u.lines.reduce((t, l) => t + lineShare(l, w), 0);
    const sumHere = (w: DayWindow) => u.lines.reduce((t, l) => t + lineShare(l, w) * hereOf(l), 0);
    const spend = sum(current);
    const paidHere = sumHere(current);
    const monthsHere: string[] = [];
    const monthsElsewhere: string[] = [];
    for (const { month, window } of months) {
      const here = sumHere(window);
      if (here > CENT) monthsHere.push(month);
      if (sum(window) - here > CENT) monthsElsewhere.push(month);
    }
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

    if (onChapter) {
      const key = String(u.hard_type);
      const t = types.get(key) ?? {
        hard_type: u.hard_type,
        unit,
        utilities: 0,
        ceased: 0,
        spend: 0,
        consumption: unit ? 0 : null,
        unit_cost: null,
        costSpend: 0,
      };
      if (u.active) t.utilities++;
      else t.ceased++;
      t.spend += spend;
      if (consumption) {
        t.consumption = (t.consumption ?? 0) + consumption;
        t.costSpend += costSpend;
      }
      types.set(key, t);
    }

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
      low_consumption: false,
      outliers: [],
      on_chapter: onChapter,
      chapter_label: onChapter ? null : (u.chapter_label ?? null),
      paid_here: round2(paidHere),
      paid_elsewhere: round2(spend - paidHere),
      months_here: monthsHere,
      months_elsewhere: monthsElsewhere,
    };
    return row;
  });

  for (const r of rows) {
    if (r.change !== null && Math.abs(r.change) > SPEND_CHANGE_LIMIT) r.outliers.push('change');
  }
  // Mediane su tutte le utenze dell'elenco, anche quelle di altri capitoli.
  for (const key of new Set(rows.map((r) => String(r.hard_type)))) {
    const withCost = rows.filter((r) => String(r.hard_type) === key && r.unit_cost !== null);
    const mc = median(withCost.map((r) => r.consumption as number));
    if (mc !== null) {
      for (const r of withCost) {
        if ((r.consumption as number) < mc * LOW_CONSUMPTION_SHARE) r.low_consumption = true;
      }
    }
    const same = withCost.filter((r) => !r.low_consumption);
    const m = median(same.map((r) => r.unit_cost as number));
    if (m === null) continue;
    for (const r of same) {
      if ((r.unit_cost as number) > m * UNIT_COST_MEDIAN_FACTOR) r.outliers.unshift('unit_cost');
    }
  }

  const own = rows.filter((r) => r.on_chapter);
  const others = rows.filter((r) => !r.on_chapter);
  const spend = own.reduce((t, r) => t + r.spend, 0);
  const previousSpend = own.reduce((t, r) => t + r.previous_spend, 0);
  const compared = own.filter((r) => r.comparable);
  const comparedSpend = compared.reduce((t, r) => t + r.spend, 0);
  const comparedPrevious = compared.reduce((t, r) => t + r.previous_spend, 0);
  const active = own.filter((r) => r.active);
  const paidOwn = own.reduce((t, r) => t + r.paid_here, 0);
  const paidOthers = others.reduce((t, r) => t + r.paid_here, 0);
  const paidUnassigned = unassigned.reduce((t, l) => t + lineShare(l, current) * hereOf(l), 0);
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
      paid_here: {
        total: round2(paidOwn + paidOthers + paidUnassigned),
        own: round2(paidOwn),
        others: round2(paidOthers),
        without_utility: round2(paidUnassigned),
      },
      own_elsewhere: round2(own.reduce((t, r) => t + r.paid_elsewhere, 0)),
    },
    utilities: rows.sort((a, b) => b.spend - a.spend),
  };
}
