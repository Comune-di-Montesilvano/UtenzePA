import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { CalcInput, effectiveEndDate } from '@apis/utilizer-grant/real-estate-contract.calc';
import { CostStatus } from '@apis/utility/cost-status';
import { GrantUtilityDecisionValue, SupplyEventType } from './enum/supply-event-type.enum';
import { SupplyEventLike, pending, stateAt } from './supply-state';

// Riconciliazione dello storico di un'utenza con i contratti immobiliari
// concessi dal Comune (roadmap voce 22, spec «Contratti immobiliari»).
// Funzione pura: il servizio carica i dati e applica il piano. Lo stato
// desiderato (obiettivo) si confronta con quello reale; solo le righe
// automatiche (collegate a un contratto) vengono annullate, mai le manuali.

export interface GrantLike extends CalcInput {
  id: number;
  start_date: string | null;
  direction: ContractDirection;
  // Non usato qui: è solo la proposta di partenza nella UI (spec «Contratti immobiliari»).
  utilities_to_be_taken_over: boolean;
  party_ids: number[];
  // update_date se lo stato non è ACTIVE.
  status_changed_on: string | null;
  // false = contratto legato all'utenza solo da una riga decisione (immobile tolto
  // dal contratto o utenza scollegata dall'immobile): vale come finito per l'utenza.
  covers_utility: boolean;
  // Contratto eliminato: vale come finito per l'utenza (come uno passivo).
  deleted?: boolean;
}

export interface DecisionLike {
  grant_id: number;
  decision: GrantUtilityDecisionValue | null;
  third_party_id: number | null;
  create_date: string;
}

export interface ReconcilePlan {
  createDecisions: {
    grant_id: number;
    decision: GrantUtilityDecisionValue | null;
    third_party_id: number | null;
  }[];
  createEvents: { type: 'TRANSFER' | 'RETURN'; third_party_id: number | null; grant_id: number }[];
  cancelEvents: { id: number; reason: string }[];
  costStatus: CostStatus;
  pendingSince: string | null;
  // Contratti attivi FOLLOWS scavalcati da uno più recente con un'altra controparte.
  overriddenGrantIds: number[];
}

export const CANCEL_GRANT_ENDED = 'Contratto immobiliare non più attivo';
export const CANCEL_STAYS = 'Decisione: resta al Comune';
export const CANCEL_UTILITY_INACTIVE = 'Utenza non attiva';
export const CANCEL_OTHER_PARTY = "Voltura verso un'altra controparte";
export const CANCEL_ALREADY_HOLDER = "L'utenza è già intestata come previsto dal contratto";
export const CANCEL_NOT_COVERED = 'Utenza non più collegata al contratto immobiliare';

const day10 = (s: string): string => s.slice(0, 10);
const maxDay = (a: string, b: string): string => (a > b ? a : b);
const FOLLOWS = GrantUtilityDecisionValue.FOLLOWS;
const STAYS = GrantUtilityDecisionValue.STAYS;

export function isGrantActive(g: GrantLike, today: string): boolean {
  return (
    !g.deleted &&
    g.direction === ContractDirection.ACTIVE &&
    g.status === ContractStatus.ACTIVE &&
    (effectiveEndDate(g, today) ?? '9999') >= today
  );
}

// Fine del contratto finito: fine effettiva se passata, altrimenti data del cambio di stato.
function grantEndDay(g: GrantLike, today: string): string | null {
  const end = effectiveEndDate(g, today);
  if (end && end < today) return end;
  return g.status_changed_on ? day10(g.status_changed_on) : null;
}

// Parte scelta con FOLLOWS (anche se non è più tra le parti); null = scelta da fare.
function chosenParty(g: GrantLike, d: { third_party_id: number | null }): number | null {
  if (d.third_party_id != null) return d.third_party_id;
  return g.party_ids.length === 1 ? g.party_ids[0] : null;
}

// Parte verso cui va l'utenza con FOLLOWS, solo se è ancora tra le parti.
function followsParty(g: GrantLike, d: { third_party_id: number | null }): number | null {
  const p = chosenParty(g, d);
  return p !== null && g.party_ids.includes(p) ? p : null;
}

// Più recente prima; start_date null = più vecchio; a parità id più alto.
function byStartDesc(a: GrantLike, b: GrantLike): number {
  const sa = a.start_date ? day10(a.start_date) : '';
  const sb = b.start_date ? day10(b.start_date) : '';
  if (sa !== sb) return sa < sb ? 1 : -1;
  return b.id - a.id;
}

export function planReconcile(input: {
  today: string;
  utilityActive: boolean;
  grants: GrantLike[];
  decisions: DecisionLike[];
  events: SupplyEventLike[];
}): ReconcilePlan {
  const today = day10(input.today);
  // Anche i contratti eliminati o passati a passivi legati all'utenza (da una
  // decisione o da una riga automatica): non sono in corso, valgono come finiti.
  const grants = input.grants;
  const grantById = new Map(grants.map((g) => [g.id, g]));
  const holder = stateAt(input.events, today).holderId;
  const live = pending(input.events);
  const isAuto = (e: SupplyEventLike) => e.utilizer_grant_id_fk != null;
  const autoPending = live.filter(
    (e) => isAuto(e) && (e.type === SupplyEventType.TRANSFER || e.type === SupplyEventType.RETURN),
  );

  const plan: ReconcilePlan = {
    createDecisions: [],
    createEvents: [],
    cancelEvents: [],
    costStatus: CostStatus.COMUNE,
    pendingSince: null,
    overriddenGrantIds: [],
  };
  const cancel = (e: SupplyEventLike, reason: string) =>
    plan.cancelEvents.push({ id: e.id, reason });

  // Contratti in corso che riguardano l'utenza.
  const covering = (g: GrantLike) => g.covers_utility && isGrantActive(g, today);
  const decisionByGrant = new Map(input.decisions.map((d) => [d.grant_id, d]));
  const activeGrants = input.utilityActive ? grants.filter(covering) : [];

  // Decisioni effettive (esistenti + da creare oggi).
  const decisions = new Map<number, DecisionLike>(decisionByGrant);
  for (const g of activeGrants) {
    if (decisionByGrant.has(g.id)) continue;
    const row = { grant_id: g.id, ...renewedDecision(g, grants, decisionByGrant, holder) };
    plan.createDecisions.push(row);
    decisions.set(g.id, { ...row, create_date: today });
  }
  const decisionOf = (g: GrantLike) => decisions.get(g.id) as DecisionLike;

  // FOLLOWS con la parte scelta tolta dal contratto in corso: caso anomalo
  // (contratto senza controparte, già segnalato altrove), nessuna azione automatica.
  const partyRemoved = (g: GrantLike): boolean => {
    const d = decisions.get(g.id);
    if (d?.decision !== FOLLOWS) return false;
    const p = chosenParty(g, d);
    return p !== null && !g.party_ids.includes(p);
  };
  const frozenGrants = activeGrants.filter(partyRemoved);
  const frozen = (e: SupplyEventLike) => frozenGrants.some((g) => g.id === e.utilizer_grant_id_fk);
  const holderFrozen = frozenGrants.some((g) => chosenParty(g, decisionOf(g)) === holder);

  // Da decidere: decisione vuota o FOLLOWS con più parti e nessuna scelta.
  const undecided = activeGrants.filter((g) => {
    const d = decisionOf(g);
    if (d.decision === null) return true;
    return d.decision === FOLLOWS && chosenParty(g, d) === null;
  });

  // Obiettivo: parte del contratto FOLLOWS iniziato per ultimo; nessuno = Comune.
  const follows = activeGrants
    .filter((g) => decisionOf(g).decision === FOLLOWS && followsParty(g, decisionOf(g)) !== null)
    .sort(byStartDesc);
  const winner = follows[0] ?? null;
  const target = winner ? followsParty(winner, decisionOf(winner)) : null;
  plan.overriddenGrantIds = follows
    .slice(1)
    .filter((g) => followsParty(g, decisionOf(g)) !== target)
    .map((g) => g.id);

  const transferReason = (e: SupplyEventLike): string => {
    if (!input.utilityActive) return CANCEL_UTILITY_INACTIVE;
    const g = grantById.get(e.utilizer_grant_id_fk as number);
    if (!g || !isGrantActive(g, today)) return CANCEL_GRANT_ENDED;
    if (!g.covers_utility) return CANCEL_NOT_COVERED;
    if (decisions.get(g.id)?.decision === STAYS) return CANCEL_STAYS;
    return CANCEL_OTHER_PARTY;
  };
  const returnReason = (): string => {
    if (!input.utilityActive) return CANCEL_UTILITY_INACTIVE;
    if (target !== null && target !== holder) return CANCEL_OTHER_PARTY;
    return CANCEL_ALREADY_HOLDER;
  };
  const autoTransfers = autoPending.filter(
    (e) => e.type === SupplyEventType.TRANSFER && (!input.utilityActive || !frozen(e)),
  );
  const autoReturns = autoPending.filter((e) => e.type === SupplyEventType.RETURN);

  if (!input.utilityActive || target === holder) {
    for (const e of autoTransfers) cancel(e, transferReason(e));
    for (const e of autoReturns) cancel(e, returnReason());
  } else if (target !== null) {
    // Voltura verso l'obiettivo, anche direttamente da un'altra parte.
    // anche quelle dei contratti con la parte tolta: c'è un altro obiettivo
    const toCancel = autoPending.filter(
      (e) => e.type === SupplyEventType.TRANSFER && e.third_party_id_fk !== target,
    );
    for (const e of toCancel) cancel(e, transferReason(e));
    for (const e of autoReturns) cancel(e, returnReason());
    const transfers = live.filter((e) => e.type === SupplyEventType.TRANSFER);
    const hasManualOther = transfers.some((e) => !isAuto(e) && e.third_party_id_fk !== target);
    if (!transfers.some((e) => e.third_party_id_fk === target) && !hasManualOther) {
      plan.createEvents.push({
        type: 'TRANSFER',
        third_party_id: target,
        grant_id: (winner as GrantLike).id,
      });
    }
  } else {
    // Obiettivo Comune, utenza intestata a un terzo.
    for (const e of autoTransfers) cancel(e, transferReason(e));
    const hasReturn = live.some((e) => e.type === SupplyEventType.RETURN);
    // Un contratto nuovo ancora da decidere riguarda l'utenza: si aspetta la decisione.
    if (!hasReturn && undecided.length === 0 && !holderFrozen) {
      // Solo se l'intestatario è parte di un contratto finito, STAYS o che non
      // riguarda più l'utenza:
      // una voltura manuale a un soggetto estraneo ai contratti non si tocca.
      const released = grants
        .filter((g) => {
          const d = decisions.get(g.id);
          const ended = !covering(g) || d?.decision === STAYS;
          const held =
            g.party_ids.includes(holder as number) ||
            (d?.decision === FOLLOWS && d.third_party_id === holder);
          return ended && held;
        })
        .sort(byStartDesc);
      if (released.length) {
        plan.createEvents.push({ type: 'RETURN', third_party_id: null, grant_id: released[0].id });
      }
    }
  }

  // Stato «A carico di» dopo il piano.
  const cancelled = new Set(plan.cancelEvents.map((c) => c.id));
  const remaining = live.filter(
    (e) =>
      !cancelled.has(e.id) &&
      (e.type === SupplyEventType.TRANSFER || e.type === SupplyEventType.RETURN),
  );
  const has = (type: SupplyEventType) =>
    remaining.some((e) => e.type === type) ||
    plan.createEvents.some((e) => (e.type as string) === type);
  if (undecided.length > 0) plan.costStatus = CostStatus.TO_DECIDE;
  else if (has(SupplyEventType.TRANSFER)) plan.costStatus = CostStatus.TO_TRANSFER;
  else if (has(SupplyEventType.RETURN)) plan.costStatus = CostStatus.TO_RECOVER;
  else if (holder !== null) plan.costStatus = CostStatus.TRANSFERRED;

  // Data evento più vecchia tra decisioni vuote e TRANSFER/RETURN in sospeso,
  // mai prima della creazione della riga.
  const dates: string[] = [];
  for (const g of undecided) {
    const created = day10(decisionOf(g).create_date);
    dates.push(g.start_date ? maxDay(day10(g.start_date), created) : created);
  }
  for (const e of remaining) {
    dates.push(maxDay(eventDay(e, grantById, today) ?? day10(e.create_date), day10(e.create_date)));
  }
  for (const e of plan.createEvents) {
    dates.push(maxDay(eventDay(e, grantById, today) ?? today, today));
  }
  plan.pendingSince = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  return plan;
}

// Decisione per un contratto in corso senza riga: si copia quella del contratto
// più recente dell'utenza con una parte in comune (rinnovo); altrimenti FOLLOWS
// se l'utenza è già intestata a una sua parte; altrimenti da decidere.
function renewedDecision(
  g: GrantLike,
  grants: GrantLike[],
  decisions: Map<number, DecisionLike>,
  holder: number | null,
): { decision: GrantUtilityDecisionValue | null; third_party_id: number | null } {
  const sources = grants.filter((o) => o.id !== g.id && decisions.get(o.id)?.decision != null);
  for (const o of sources.sort(byStartDesc)) {
    const d = decisions.get(o.id) as DecisionLike;
    if (d.decision === FOLLOWS) {
      const p = chosenParty(o, d);
      if (p !== null && g.party_ids.includes(p)) return { decision: FOLLOWS, third_party_id: p };
    } else if (o.party_ids.some((p) => g.party_ids.includes(p))) {
      return { decision: STAYS, third_party_id: null };
    }
  }
  if (holder !== null && g.party_ids.includes(holder)) {
    return { decision: FOLLOWS, third_party_id: holder };
  }
  return { decision: null, third_party_id: null };
}

// Data evento di una riga (senza il limite della data di creazione).
function eventDay(
  e:
    | SupplyEventLike
    | { type: 'TRANSFER' | 'RETURN'; grant_id: number; third_party_id: number | null },
  grantById: Map<number, GrantLike>,
  today: string,
): string | null {
  const grantId = 'grant_id' in e ? e.grant_id : e.utilizer_grant_id_fk;
  const g = grantId != null ? grantById.get(grantId) : undefined;
  const type = e.type as string;
  let day: string | null = null;
  if (g && type === SupplyEventType.TRANSFER) day = g.start_date ? day10(g.start_date) : null;
  else if (g && type === SupplyEventType.RETURN) day = grantEndDay(g, today);
  if (day) return day;
  return 'requested_on' in e && e.requested_on ? day10(e.requested_on) : null;
}
