import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';

// Funzioni pure, nessun accesso DB: tutto il calcolo consumi passa di qui
// ed è testato in isolamento. Le date sono giorni di calendario
// ('YYYY-MM-DD'), rappresentati internamente come numero di giorni
// dall'epoch UTC — niente orari/timezone.

export interface ConsumptionRecord {
  id?: number;
  kind: ConsumptionKind;
  reading_date?: string | null;
  // number | string: le colonne decimal arrivano da mysql2 come stringa.
  reading_value?: number | string | null;
  meter_number?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  consumption?: number | string | null;
}

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
}

const MS_PER_DAY = 86_400_000;
export const WINDOW_DAYS = 365;
const PAST_MONTHS = 24;
const FUTURE_MONTHS = 12;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function toDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function todayDay(now: Date = new Date()): number {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
}

export function normalizeMeter(meter?: string | null): string {
  return (meter ?? '').trim().toLowerCase();
}

export function sortedReadings(records: ConsumptionRecord[]): ConsumptionRecord[] {
  return records
    .filter((r) => r.kind === ConsumptionKind.READING && r.reading_date && r.reading_value != null)
    .sort((a, b) => toDay(a.reading_date) - toDay(b.reading_date) || (a.id ?? 0) - (b.id ?? 0));
}

// Consumo di ogni lettura rispetto alla precedente (per data) con la stessa
// matricola adiacente; null per la prima lettura e per un nuovo contatore.
export function readingDeltas(records: ConsumptionRecord[]): Map<number, number | null> {
  const result = new Map<number, number | null>();
  let prev: ConsumptionRecord | null = null;
  for (const r of sortedReadings(records)) {
    const sameMeter = prev && normalizeMeter(prev.meter_number) === normalizeMeter(r.meter_number);
    if (r.id !== undefined) {
      result.set(
        r.id,
        sameMeter ? round2(Number(r.reading_value) - Number(prev.reading_value)) : null,
      );
    }
    prev = r;
  }
  return result;
}

// Mappa sparsa giorno -> consumo. I periodi hanno precedenza: un giorno
// coperto da un periodo ignora la quota da letture (non redistribuita).
export function buildDailyConsumption(records: ConsumptionRecord[]): Map<number, number> {
  const daily = new Map<number, number>();

  for (const r of records) {
    if (
      r.kind !== ConsumptionKind.PERIOD ||
      !r.period_start ||
      !r.period_end ||
      r.consumption == null
    )
      continue;
    const start = toDay(r.period_start);
    const end = toDay(r.period_end);
    const days = end - start + 1;
    if (days <= 0) continue;
    const rate = Number(r.consumption) / days;
    for (let d = start; d <= end; d++) daily.set(d, (daily.get(d) ?? 0) + rate);
  }

  const periodDays = new Set(daily.keys());
  const readings = sortedReadings(records);
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1];
    const b = readings[i];
    if (normalizeMeter(a.meter_number) !== normalizeMeter(b.meter_number)) continue;
    const from = toDay(a.reading_date);
    const to = toDay(b.reading_date);
    if (to <= from) continue;
    const rate = (Number(b.reading_value) - Number(a.reading_value)) / (to - from);
    if (rate < 0) continue;
    for (let d = from + 1; d <= to; d++) {
      if (!periodDays.has(d)) daily.set(d, (daily.get(d) ?? 0) + rate);
    }
  }

  return daily;
}

export function computeActual(
  daily: Map<number, number>,
  today: number,
): { actual: number; coverageDays: number } {
  let actual = 0;
  let coverageDays = 0;
  for (let d = today - WINDOW_DAYS + 1; d <= today; d++) {
    const v = daily.get(d);
    if (v !== undefined) {
      actual += v;
      coverageDays++;
    }
  }
  return { actual: round2(actual), coverageDays };
}

// Media giornaliera di riferimento: giorni coperti nella finestra, se
// nessuno tutto lo storico coperto (fino a oggi), altrimenti null.
function meanDaily(daily: Map<number, number>, today: number): number | null {
  const average = (days: number[]) => days.reduce((sum, d) => sum + daily.get(d), 0) / days.length;
  const all = [...daily.keys()].filter((d) => d <= today);
  const inWindow = all.filter((d) => d > today - WINDOW_DAYS);
  if (inWindow.length) return average(inWindow);
  if (all.length) return average(all);
  return null;
}

// Stima di un giorno futuro: stesso giorno dell'anno precedente (ripiegando
// di 365 giorni finché si cade in un giorno passato), altrimenti media.
function estimatedDay(
  daily: Map<number, number>,
  day: number,
  today: number,
  mean: number,
): number {
  let source = day - WINDOW_DAYS;
  while (source > today) source -= WINDOW_DAYS;
  return daily.get(source) ?? mean;
}

export function computeSeasonalEstimate(daily: Map<number, number>, today: number): number | null {
  const mean = meanDaily(daily, today);
  if (mean === null) return null;
  let total = 0;
  for (let d = today + 1; d <= today + WINDOW_DAYS; d++)
    total += estimatedDay(daily, d, today, mean);
  return round2(total);
}

export function computeMonthlySeries(daily: Map<number, number>, today: number): MonthlyPoint[] {
  const mean = meanDaily(daily, today);
  const t = new Date(today * MS_PER_DAY);
  const year = t.getUTCFullYear();
  const month = t.getUTCMonth();
  const points: MonthlyPoint[] = [];

  for (let offset = -(PAST_MONTHS - 1); offset <= FUTURE_MONTHS; offset++) {
    const first = Math.round(Date.UTC(year, month + offset, 1) / MS_PER_DAY);
    const next = Math.round(Date.UTC(year, month + offset + 1, 1) / MS_PER_DAY);
    let actual = 0;
    let covered = 0;
    let estimated = 0;
    for (let d = first; d < next; d++) {
      if (d <= today) {
        const v = daily.get(d);
        if (v !== undefined) {
          actual += v;
          covered++;
        }
      } else if (mean !== null) {
        estimated += estimatedDay(daily, d, today, mean);
      }
    }
    points.push({
      month: fromDay(first).slice(0, 7),
      actual: round2(actual),
      covered_days: covered,
      days: next - first,
      estimated: round2(estimated),
    });
  }

  return points;
}

export function manualValidUntil(setAt: Date): Date {
  const limit = new Date(setAt);
  limit.setMonth(limit.getMonth() + 12);
  return limit;
}

// null = stima persistita da non toccare.
export function decideEstimate(
  state: { source: EstimateSource; setAt: Date | null },
  historyEstimate: number | null,
  now: Date,
): {
  estimated_annual_consumption: number;
  estimated_consumption_source: EstimateSource.HISTORY;
  estimated_consumption_set_at: null;
} | null {
  const manualValid =
    state.source === EstimateSource.MANUAL &&
    state.setAt !== null &&
    manualValidUntil(state.setAt) > now;
  if (manualValid || historyEstimate === null) return null;
  return {
    estimated_annual_consumption: historyEstimate,
    estimated_consumption_source: EstimateSource.HISTORY,
    estimated_consumption_set_at: null,
  };
}

// Tiene solo i campi del tipo di rilevazione, azzera gli altri.
export function normalizeByKind(
  record: ConsumptionRecord & { notes?: string | null },
): ConsumptionRecord & { notes: string | null } {
  const isReading = record.kind === ConsumptionKind.READING;
  return {
    kind: record.kind,
    reading_date: isReading ? (record.reading_date ?? null) : null,
    reading_value: isReading ? (record.reading_value ?? null) : null,
    meter_number: isReading ? (record.meter_number?.trim() ?? null) : null,
    period_start: isReading ? null : (record.period_start ?? null),
    period_end: isReading ? null : (record.period_end ?? null),
    consumption: isReading ? null : (record.consumption ?? null),
    notes: record.notes ?? null,
  };
}

// Messaggio d'errore (italiano, mostrato all'utente) o null se valida.
// `others` = altre rilevazioni non cancellate della stessa utenza; il record
// con lo stesso id del candidato (modifica) viene ignorato.
export function validateConsumption(
  candidate: ConsumptionRecord,
  others: ConsumptionRecord[],
  today: number,
): string | null {
  const rest = others.filter((o) => candidate.id === undefined || o.id !== candidate.id);

  if (candidate.kind === ConsumptionKind.READING) {
    if (
      !candidate.reading_date ||
      candidate.reading_value == null ||
      !normalizeMeter(candidate.meter_number)
    ) {
      return 'Data, valore lettura e matricola sono obbligatori.';
    }
    const day = toDay(candidate.reading_date);
    if (day > today) return 'La data della lettura non può essere futura.';
    const meter = normalizeMeter(candidate.meter_number);
    const value = Number(candidate.reading_value);
    const sameMeter = sortedReadings(rest).filter((r) => normalizeMeter(r.meter_number) === meter);
    if (sameMeter.some((r) => toDay(r.reading_date) === day)) {
      return 'Lettura già presente per questa matricola in questa data.';
    }
    const prev = sameMeter.filter((r) => toDay(r.reading_date) < day).slice(-1)[0];
    if (prev && value < Number(prev.reading_value)) {
      return `Lettura inferiore alla precedente (${Number(prev.reading_value)} del ${prev.reading_date}) per la stessa matricola.`;
    }
    const next = sameMeter.find((r) => toDay(r.reading_date) > day);
    if (next && value > Number(next.reading_value)) {
      return `Lettura superiore alla successiva (${Number(next.reading_value)} del ${next.reading_date}) per la stessa matricola.`;
    }
    return null;
  }

  if (!candidate.period_start || !candidate.period_end || candidate.consumption == null) {
    return 'Inizio, fine periodo e consumo sono obbligatori.';
  }
  const start = toDay(candidate.period_start);
  const end = toDay(candidate.period_end);
  if (end < start) return 'La fine del periodo non può precedere l’inizio.';
  if (end > today) return 'Il periodo non può terminare nel futuro.';
  const overlap = rest.find(
    (o) =>
      o.kind === ConsumptionKind.PERIOD &&
      o.period_start &&
      o.period_end &&
      !(end < toDay(o.period_start) || start > toDay(o.period_end)),
  );
  if (overlap) {
    return `Il periodo si sovrappone a un periodo già inserito (${overlap.period_start} – ${overlap.period_end}).`;
  }
  return null;
}
