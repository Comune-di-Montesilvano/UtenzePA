import { SupplyEventType } from './enum/supply-event-type.enum';
import {
  DayInterval,
  SupplyEventLike,
  activeIntervals,
  holderIntervals,
  subtractIntervals,
} from './supply-state';

// Riga fattura fuori dai periodi in cui l'utenza era attiva e intestata al
// Comune (anomalia «Fatture fuori dai periodi di attività»). Date 'AAAA-MM-GG'.
export interface InvoiceLinePeriod {
  period_start: string | null;
  period_end: string | null;
  invoice_date: string;
}

const MIN_DAY = '0000-01-01';
const MAX_DAY = '9999-12-31';
const day10 = (s: string): string => s.slice(0, 10);

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isActivityChange = (e: SupplyEventLike) =>
  !e.deleted &&
  !e.cancelled_on &&
  (e.type === SupplyEventType.ACTIVATION || e.type === SupplyEventType.CESSATION);

// Periodo della riga (senza periodo: la data della fattura) confrontato con i
// periodi attivi allargati di `toleranceDays` dopo ogni cessazione e prima di
// ogni attivazione datate. Anomala se una parte del periodo resta scoperta.
// Le righe «data non nota» vengono prima di tutte le datate: se l'ultima è
// una cessazione, prima della prima data lo stato non è determinabile e non
// si segnala nulla; se è un'attivazione, l'utenza è attiva da prima.
// Senza attivazioni/cessazioni datate è tutto coperto. Dai periodi coperti si
// tolgono quelli di voltura effettiva (decisione utente 2026-10-19): il
// periodo del Comune finisce alla voltura (+ tolleranza) e riparte dalla
// reintestazione (- tolleranza), come per cessazione e attivazione.
export function outOfPeriod(
  line: InvoiceLinePeriod,
  events: SupplyEventLike[],
  toleranceDays = 30,
): boolean {
  const changes = events.filter(isActivityChange);
  const dated = changes.filter((e) => !e.date_unknown && !!e.effective_on);

  let active: DayInterval[] = [{ start: null, end: null }];
  if (dated.length) {
    active = activeIntervals(dated);
    if (changes.some((e) => e.date_unknown)) {
      // Attiva da prima o non determinabile: coperto fino alla prima data.
      const first = dated.map((e) => day10(e.effective_on as string)).sort()[0];
      active.unshift({ start: null, end: first });
    }
  }
  const intervals = subtractIntervals(active, holderIntervals(events));

  const covered = intervals
    .map((i) => ({
      start: i.start ? addDays(i.start, -toleranceDays) : MIN_DAY,
      end: i.end ? addDays(i.end, toleranceDays) : MAX_DAY,
    }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: { start: string; end: string }[] = [];
  for (const c of covered) {
    const last = merged[merged.length - 1];
    if (last && c.start <= (last.end === MAX_DAY ? MAX_DAY : addDays(last.end, 1))) {
      if (c.end > last.end) last.end = c.end;
    } else {
      merged.push({ ...c });
    }
  }

  const invoiceDay = day10(line.invoice_date);
  let from = line.period_start ? day10(line.period_start) : null;
  let to = line.period_end ? day10(line.period_end) : null;
  from = from ?? to ?? invoiceDay;
  to = to ?? from;
  if (from > to) [from, to] = [to, from];
  return !merged.some((m) => m.start <= from && to <= m.end);
}
