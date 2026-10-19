import { SupplyEventType } from './enum/supply-event-type.enum';

// Funzioni pure sullo storico di un'utenza (roadmap voce 22): nessuna
// dipendenza da DB o Nest. Le date sono stringhe 'AAAA-MM-GG'.
export interface SupplyEventLike {
  id: number;
  type: SupplyEventType;
  third_party_id_fk: number | null;
  requested_on: string | null;
  effective_on: string | null;
  date_unknown: boolean;
  cancelled_on: string | null;
  deleted: boolean;
  utilizer_grant_id_fk: number | null;
  create_date: string;
}

const day10 = (s: string): string => s.slice(0, 10);

function isLive(e: SupplyEventLike): boolean {
  return !e.deleted && !e.cancelled_on;
}

function isEffective(e: SupplyEventLike): boolean {
  return isLive(e) && (e.date_unknown || !!e.effective_on);
}

// date_unknown prima, poi effective_on, a parità id.
function compareEffective(a: SupplyEventLike, b: SupplyEventLike): number {
  if (a.date_unknown !== b.date_unknown) return a.date_unknown ? -1 : 1;
  if (!a.date_unknown) {
    const da = day10(a.effective_on as string);
    const db = day10(b.effective_on as string);
    if (da !== db) return da < db ? -1 : 1;
  }
  return a.id - b.id;
}

function effectiveSorted(events: SupplyEventLike[], upTo?: string): SupplyEventLike[] {
  return events
    .filter(
      (e) =>
        isEffective(e) &&
        (upTo === undefined || e.date_unknown || day10(e.effective_on as string) <= upTo),
    )
    .sort(compareEffective);
}

function dateOf(e: SupplyEventLike): string | null {
  return e.date_unknown || !e.effective_on ? null : day10(e.effective_on);
}

export function stateAt(
  events: SupplyEventLike[],
  day: string,
): { active: boolean; holderId: number | null } {
  let active = false;
  let holderId: number | null = null;
  for (const e of effectiveSorted(events, day10(day))) {
    if (e.type === SupplyEventType.ACTIVATION) active = true;
    else if (e.type === SupplyEventType.CESSATION) active = false;
    else if (e.type === SupplyEventType.TRANSFER) holderId = e.third_party_id_fk;
    else if (e.type === SupplyEventType.RETURN) holderId = null;
  }
  return { active, holderId };
}

export function currentSnapshot(
  events: SupplyEventLike[],
  today: string,
): {
  supply_active: boolean;
  activated_on: string | null;
  ceased_on: string | null;
  transferred_to_third_party_id: number | null;
  transferred_on: string | null;
} {
  const sorted = effectiveSorted(events, day10(today));
  const { active, holderId } = stateAt(events, today);
  let activatedOn: string | null = null;
  let ceasedOn: string | null = null;
  let transferredOn: string | null = null;
  for (const e of sorted) {
    if (e.type === SupplyEventType.ACTIVATION) activatedOn = dateOf(e);
    else if (e.type === SupplyEventType.CESSATION) ceasedOn = dateOf(e);
    else if (e.type === SupplyEventType.TRANSFER) transferredOn = dateOf(e);
    else if (e.type === SupplyEventType.RETURN) transferredOn = null;
  }
  return {
    supply_active: active,
    activated_on: activatedOn,
    ceased_on: ceasedOn,
    transferred_to_third_party_id: holderId,
    transferred_on: holderId === null ? null : transferredOn,
  };
}

// start null = da prima; end null = in corso.
export function activeIntervals(
  events: SupplyEventLike[],
): { start: string | null; end: string | null }[] {
  const out: { start: string | null; end: string | null }[] = [];
  let open = false;
  let start: string | null = null;
  for (const e of effectiveSorted(events)) {
    if (e.type === SupplyEventType.ACTIVATION) {
      if (!open) {
        open = true;
        start = dateOf(e);
      }
    } else if (e.type === SupplyEventType.CESSATION) {
      if (open) {
        out.push({ start, end: dateOf(e) });
        open = false;
        start = null;
      } else if (out.length === 0) {
        // cessazione senza attivazione registrata: attiva da prima
        out.push({ start: null, end: dateOf(e) });
      }
    }
  }
  if (open) out.push({ start, end: null });
  return out;
}

export function pending(events: SupplyEventLike[]): SupplyEventLike[] {
  return events.filter((e) => isLive(e) && !e.date_unknown && !e.effective_on);
}

export const DATE_UNKNOWN_WITH_DATES_MESSAGE =
  "L'utenza ha già date note: indica una data effettiva, anche stimata, e scrivilo nelle note.";

// Messaggio d'errore (da restituire come 400) o null se la riga è accettabile.
// `others` = le altre righe dell'utenza (senza la riga stessa se in modifica);
// `previous` = la riga com'era prima della modifica (null se nuova).
export function validateEvent(
  candidate: SupplyEventLike,
  others: SupplyEventLike[],
  today: string,
  previous: SupplyEventLike | null = null,
): string | null {
  if (!isLive(candidate)) return null;
  const isPending = !candidate.date_unknown && !candidate.effective_on;

  if (candidate.type === SupplyEventType.TRANSFER && candidate.third_party_id_fk == null) {
    return "Indicare a chi va volturata l'utenza.";
  }
  if (candidate.effective_on && day10(candidate.effective_on) > day10(today)) {
    return 'La data effettiva non può essere nel futuro.';
  }
  if (
    candidate.effective_on &&
    candidate.requested_on &&
    day10(candidate.effective_on) < day10(candidate.requested_on)
  ) {
    return 'La data effettiva non può precedere la richiesta.';
  }
  // Attivazione/cessazione «data non nota» = prima di ogni data: con righe
  // già datate cambierebbe lo stato di periodi già noti. Una riga che era già
  // così (es. dalla migration) resta modificabile.
  const supplyType =
    candidate.type === SupplyEventType.ACTIVATION || candidate.type === SupplyEventType.CESSATION;
  const alreadyUnknown =
    !!previous && previous.date_unknown && previous.type === candidate.type;
  if (
    supplyType &&
    candidate.date_unknown &&
    !alreadyUnknown &&
    others.some((o) => isLive(o) && !o.date_unknown && !!o.effective_on)
  ) {
    return DATE_UNKNOWN_WITH_DATES_MESSAGE;
  }
  if (isPending && pending(others).some((o) => o.type === candidate.type)) {
    return "C'è già una richiesta in sospeso di questo tipo.";
  }
  const holder = stateAt(others, today).holderId;
  if (candidate.type === SupplyEventType.TRANSFER && candidate.third_party_id_fk === holder) {
    return "L'utenza è già intestata a questo soggetto.";
  }
  if (candidate.type === SupplyEventType.RETURN && holder === null) {
    return "L'utenza è già intestata al Comune.";
  }
  return null;
}

// Avvisi non bloccanti sulla sequenza delle righe effettive.
export function sequenceWarnings(events: SupplyEventLike[]): string[] {
  const warnings = new Set<string>();
  let last: SupplyEventType | null = null;
  for (const e of effectiveSorted(events)) {
    if (e.type === SupplyEventType.ACTIVATION || e.type === SupplyEventType.CESSATION) {
      if (last === e.type) {
        warnings.add(
          e.type === SupplyEventType.ACTIVATION
            ? 'Due attivazioni di fila: manca una cessazione?'
            : "Due cessazioni di fila: manca un'attivazione?",
        );
      }
      last = e.type;
    } else if (e.type === SupplyEventType.TRANSFER && last === SupplyEventType.CESSATION) {
      warnings.add("Voltura registrata su un'utenza cessata.");
    }
  }
  return [...warnings];
}
