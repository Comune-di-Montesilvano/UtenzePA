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
  consumption_f0?: number | string | null;
  consumption_f1?: number | string | null;
  consumption_f2?: number | string | null;
  consumption_f3?: number | string | null;
  reactive_penalty?: boolean | null;
}

export type BandKey = 'F0' | 'F1' | 'F2' | 'F3';

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
  // Solo se l'utenza ha dati per fascia: parte del reale e dello stimato per
  // fascia (il resto del totale è «non ripartito»). Chiavi solo se > 0.
  bands?: Partial<Record<BandKey, number>>;
  estimated_bands?: Partial<Record<BandKey, number>>;
}

const MS_PER_DAY = 86_400_000;
export const WINDOW_DAYS = 365;
// Scarto ammesso tra somma delle fasce e consumo del periodo (arrotondamenti).
export const BAND_TOLERANCE_KWH = 1;
export const BAND_FIELDS = ['consumption_f0', 'consumption_f1', 'consumption_f2', 'consumption_f3'] as const;
type BandField = (typeof BAND_FIELDS)[number];
const BAND_KEY: Record<BandField, BandKey> = {
  consumption_f0: 'F0',
  consumption_f1: 'F1',
  consumption_f2: 'F2',
  consumption_f3: 'F3',
};
// Totalizzatori del contatore multiorario: F1–F3 (il monorario ha solo il totale).
const READING_BAND_FIELDS: BandField[] = ['consumption_f1', 'consumption_f2', 'consumption_f3'];
const hasValue = (v: unknown): boolean => v !== null && v !== undefined && v !== '';
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

// "Oggi" sul calendario italiano, indipendente dal fuso del server (il
// container gira in UTC: tra mezzanotte e le 2 ora italiana sarebbe ancora
// il giorno prima, e una lettura datata oggi risulterebbe futura).
const ROME_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayDay(now: Date = new Date()): number {
  return toDay(ROME_DATE.format(now));
}

// Data minima accettata per rilevazioni: evita date palesemente errate
// (e cicli su centinaia di migliaia di giorni nel calcolo).
export const MIN_CONSUMPTION_DATE = '1990-01-01';

const formatIt = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export function normalizeMeter(meter?: string | null): string {
  return (meter ?? '').trim().toLowerCase();
}

export function sortedReadings(records: ConsumptionRecord[]): ConsumptionRecord[] {
  return records
    .filter((r) => r.kind === ConsumptionKind.READING && r.reading_date && r.reading_value != null)
    .sort((a, b) => toDay(a.reading_date) - toDay(b.reading_date) || (a.id ?? 0) - (b.id ?? 0));
}

// Coppie di letture consecutive della stessa matricola che delimitano un
// intervallo di consumo valido: scartata se in mezzo (strettamente, date
// escluse) c'è una lettura di un'altra matricola — contatore sostituito e
// poi ripreso. Letture di chiusura e apertura nella stessa data, inserite in
// qualsiasi ordine, non spezzano la coppia.
function readingPairs(records: ConsumptionRecord[]): [ConsumptionRecord, ConsumptionRecord][] {
  const readings = sortedReadings(records);
  const pairs: [ConsumptionRecord, ConsumptionRecord][] = [];
  const byMeter = new Map<string, ConsumptionRecord[]>();
  for (const r of readings) {
    const key = normalizeMeter(r.meter_number);
    byMeter.set(key, [...(byMeter.get(key) ?? []), r]);
  }
  for (const [meter, list] of byMeter) {
    for (let i = 1; i < list.length; i++) {
      const from = toDay(list[i - 1].reading_date);
      const to = toDay(list[i].reading_date);
      const interrupted = readings.some((r) => {
        const d = toDay(r.reading_date);
        return normalizeMeter(r.meter_number) !== meter && d > from && d < to;
      });
      if (!interrupted) pairs.push([list[i - 1], list[i]]);
    }
  }
  return pairs;
}

// Consumo di ogni lettura rispetto alla precedente della stessa matricola;
// null per la prima lettura di un contatore e dopo un'interruzione.
export function readingDeltas(records: ConsumptionRecord[]): Map<number, number | null> {
  const result = new Map<number, number | null>();
  for (const r of sortedReadings(records)) {
    if (r.id !== undefined) result.set(r.id, null);
  }
  for (const [a, b] of readingPairs(records)) {
    if (b.id !== undefined)
      result.set(b.id, round2(Number(b.reading_value) - Number(a.reading_value)));
  }
  return result;
}

// Lettura che determina la matricola attuale dell'utenza: la più recente;
// a parità di data preferisce la matricola che non compare prima (apertura
// del contatore nuovo) rispetto alla chiusura del vecchio.
export function currentMeterReading(records: ConsumptionRecord[]): ConsumptionRecord | undefined {
  const readings = sortedReadings(records);
  if (!readings.length) return undefined;
  const lastDay = toDay(readings[readings.length - 1].reading_date);
  const sameDay = readings.filter((r) => toDay(r.reading_date) === lastDay);
  const seenBefore = new Set(
    readings
      .filter((r) => toDay(r.reading_date) < lastDay)
      .map((r) => normalizeMeter(r.meter_number)),
  );
  return (
    sameDay.find((r) => !seenBefore.has(normalizeMeter(r.meter_number))) ??
    sameDay[sameDay.length - 1]
  );
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
  for (const [a, b] of readingPairs(records)) {
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

// Mappe giorno -> consumo per fascia (solo fasce con almeno un dato): dai
// periodi con la fascia valorizzata e dalle coppie di letture con entrambi i
// totalizzatori. Come per il totale, i giorni coperti da un periodo ignorano
// le letture.
export function buildDailyBands(records: ConsumptionRecord[]): Partial<Record<BandKey, Map<number, number>>> {
  const periodDays = new Set<number>();
  for (const r of records) {
    if (r.kind !== ConsumptionKind.PERIOD || !r.period_start || !r.period_end || r.consumption == null) continue;
    for (let d = toDay(r.period_start); d <= toDay(r.period_end); d++) periodDays.add(d);
  }
  const pairs = readingPairs(records);
  const out: Partial<Record<BandKey, Map<number, number>>> = {};
  for (const f of BAND_FIELDS) {
    const daily = new Map<number, number>();
    for (const r of records) {
      if (r.kind !== ConsumptionKind.PERIOD || !r.period_start || !r.period_end || !hasValue(r[f])) continue;
      const start = toDay(r.period_start);
      const end = toDay(r.period_end);
      if (end < start) continue;
      const rate = Number(r[f]) / (end - start + 1);
      for (let d = start; d <= end; d++) daily.set(d, (daily.get(d) ?? 0) + rate);
    }
    for (const [a, b] of pairs) {
      if (!hasValue(a[f]) || !hasValue(b[f])) continue;
      const from = toDay(a.reading_date);
      const to = toDay(b.reading_date);
      if (to <= from) continue;
      const rate = (Number(b[f]) - Number(a[f])) / (to - from);
      if (rate < 0) continue;
      for (let d = from + 1; d <= to; d++) {
        if (!periodDays.has(d)) daily.set(d, (daily.get(d) ?? 0) + rate);
      }
    }
    if (daily.size) out[BAND_KEY[f]] = daily;
  }
  return out;
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

export function computeMonthlySeries(
  daily: Map<number, number>,
  today: number,
  bandDaily: Partial<Record<BandKey, Map<number, number>>> = {},
): MonthlyPoint[] {
  const mean = meanDaily(daily, today);
  // Stimato per fascia = stimato totale × quota della fascia sul reale
  // dell'ultimo anno: i segmenti sommano sempre al più al totale.
  const bandKeys = Object.keys(bandDaily) as BandKey[];
  const shares: Partial<Record<BandKey, number>> = {};
  if (bandKeys.length) {
    let windowTotal = 0;
    for (let d = today - WINDOW_DAYS + 1; d <= today; d++) windowTotal += daily.get(d) ?? 0;
    for (const k of bandKeys) {
      let s = 0;
      for (let d = today - WINDOW_DAYS + 1; d <= today; d++) s += bandDaily[k].get(d) ?? 0;
      shares[k] = windowTotal > 0 ? s / windowTotal : 0;
    }
  }
  // Giorni passati dopo l'ultimo dato (bolletta non ancora arrivata): stimati
  // come i futuri. I buchi prima dell'ultimo dato restano dati mancanti.
  let lastDataDay = -Infinity;
  for (const d of daily.keys()) if (d <= today && d > lastDataDay) lastDataDay = d;
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
        } else if (mean !== null && d > lastDataDay) {
          estimated += estimatedDay(daily, d, today, mean);
        }
      } else if (mean !== null) {
        estimated += estimatedDay(daily, d, today, mean);
      }
    }
    const point: MonthlyPoint = {
      month: fromDay(first).slice(0, 7),
      actual: round2(actual),
      covered_days: covered,
      days: next - first,
      estimated: round2(estimated),
    };
    if (bandKeys.length) {
      point.bands = {};
      point.estimated_bands = {};
      for (const k of bandKeys) {
        let a = 0;
        for (let d = first; d < next && d <= today; d++) a += bandDaily[k].get(d) ?? 0;
        if (round2(a) > 0) point.bands[k] = round2(a);
        const e = round2(estimated * (shares[k] ?? 0));
        if (e > 0) point.estimated_bands[k] = e;
      }
    }
    points.push(point);
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

// Tiene solo i campi del tipo di rilevazione, azzera gli altri. Solo utenze
// elettriche: sui periodi fasce F0–F3 (consumo) e penale reattiva, sulle
// letture i totalizzatori F1–F3 (valore letto sul contatore).
export function normalizeByKind(
  record: ConsumptionRecord & { notes?: string | null },
  isElectric = false,
): ConsumptionRecord & { notes: string | null } {
  const isReading = record.kind === ConsumptionKind.READING;
  const keepBands = !isReading && isElectric;
  const band = (v: number | string | null | undefined, onReadings = true): number | null =>
    isElectric && (!isReading || onReadings) && hasValue(v) ? Number(v) : null;
  return {
    kind: record.kind,
    reading_date: isReading ? (record.reading_date ?? null) : null,
    reading_value: isReading ? (record.reading_value ?? null) : null,
    meter_number: isReading ? (record.meter_number?.trim() ?? null) : null,
    period_start: isReading ? null : (record.period_start ?? null),
    period_end: isReading ? null : (record.period_end ?? null),
    consumption: isReading ? null : (record.consumption ?? null),
    consumption_f0: band(record.consumption_f0, false),
    consumption_f1: band(record.consumption_f1),
    consumption_f2: band(record.consumption_f2),
    consumption_f3: band(record.consumption_f3),
    reactive_penalty: keepBands ? (record.reactive_penalty ?? null) : null,
    notes: record.notes ?? null,
  };
}

const kwhIt = (n: number): string => n.toLocaleString('it-IT', { maximumFractionDigits: 3 });

// Messaggio d'errore o null: le fasce (facoltative) devono sommare al consumo
// del periodo, i totalizzatori al valore letto; quelli vuoti valgono 0.
// Nessun controllo senza fasce.
export function validateBands(candidate: ConsumptionRecord): string | null {
  const isReading = candidate.kind === ConsumptionKind.READING;
  const values = (isReading ? READING_BAND_FIELDS : [...BAND_FIELDS])
    .map((f) => candidate[f])
    .filter(hasValue);
  if (!values.length) return null;
  const sum = Math.round(values.reduce<number>((s, v) => s + Number(v), 0) * 1000) / 1000;
  const total = Number((isReading ? candidate.reading_value : candidate.consumption) ?? 0);
  if (Math.abs(sum - total) <= BAND_TOLERANCE_KWH) return null;
  return isReading
    ? `La somma dei totalizzatori di fascia (${kwhIt(sum)} kWh) non coincide con il valore letto (${kwhIt(total)} kWh).`
    : `La somma delle fasce (${kwhIt(sum)} kWh) non coincide con il consumo del periodo (${kwhIt(total)} kWh).`;
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
    if (day < toDay(MIN_CONSUMPTION_DATE))
      return `La data della lettura non può essere anteriore al ${formatIt(MIN_CONSUMPTION_DATE)}.`;
    const meter = normalizeMeter(candidate.meter_number);
    const value = Number(candidate.reading_value);
    const sameMeter = sortedReadings(rest).filter((r) => normalizeMeter(r.meter_number) === meter);
    if (sameMeter.some((r) => toDay(r.reading_date) === day)) {
      return 'Lettura già presente per questa matricola in questa data.';
    }
    const prev = sameMeter.filter((r) => toDay(r.reading_date) < day).slice(-1)[0];
    if (prev && value < Number(prev.reading_value)) {
      return `Lettura inferiore alla precedente (${Number(prev.reading_value)} del ${formatIt(prev.reading_date)}) per la stessa matricola.`;
    }
    const next = sameMeter.find((r) => toDay(r.reading_date) > day);
    if (next && value > Number(next.reading_value)) {
      return `Lettura superiore alla successiva (${Number(next.reading_value)} del ${formatIt(next.reading_date)}) per la stessa matricola.`;
    }
    // Anche ogni totalizzatore di fascia cresce nel tempo, a parità di contatore.
    for (const f of READING_BAND_FIELDS) {
      if (!hasValue(candidate[f])) continue;
      const v = Number(candidate[f]);
      if (prev && hasValue(prev[f]) && v < Number(prev[f])) {
        return `Totalizzatore ${BAND_KEY[f]} inferiore alla lettura precedente (${Number(prev[f])} del ${formatIt(prev.reading_date)}) per la stessa matricola.`;
      }
      if (next && hasValue(next[f]) && v > Number(next[f])) {
        return `Totalizzatore ${BAND_KEY[f]} superiore alla lettura successiva (${Number(next[f])} del ${formatIt(next.reading_date)}) per la stessa matricola.`;
      }
    }
    return null;
  }

  if (!candidate.period_start || !candidate.period_end || candidate.consumption == null) {
    return 'Inizio, fine periodo e consumo sono obbligatori.';
  }
  const start = toDay(candidate.period_start);
  const end = toDay(candidate.period_end);
  if (end < start) return 'La fine del periodo non può precedere l’inizio.';
  if (start < toDay(MIN_CONSUMPTION_DATE))
    return `Il periodo non può iniziare prima del ${formatIt(MIN_CONSUMPTION_DATE)}.`;
  if (end > today) return 'Il periodo non può terminare nel futuro.';
  const overlap = rest.find(
    (o) =>
      o.kind === ConsumptionKind.PERIOD &&
      o.period_start &&
      o.period_end &&
      !(end < toDay(o.period_start) || start > toDay(o.period_end)),
  );
  if (overlap) {
    return `Il periodo si sovrappone a un periodo già inserito (${formatIt(overlap.period_start)} – ${formatIt(overlap.period_end)}).`;
  }
  return null;
}
