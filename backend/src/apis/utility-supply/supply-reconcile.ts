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
  utilities_to_be_taken_over: boolean;
  party_ids: number[];
  // update_date se lo stato non è ACTIVE.
  status_changed_on: string | null;
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

const day10 = (s: string): string => s.slice(0, 10);
const maxDay = (a: string, b: string): string => (a > b ? a : b);

export function isGrantActive(g: GrantLike, today: string): boolean {
  return (
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

// Parte verso cui va l'utenza con FOLLOWS; null = scelta da fare.
function followsParty(g: GrantLike, d: { third_party_id: number | null }): number | null {
  if (d.third_party_id != null) {
    return g.party_ids.includes(d.third_party_id) ? d.third_party_id : null;
  }
  return g.party_ids.length === 1 ? g.party_ids[0] : null;
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
  const grants = input.grants.filter((g) => g.direction === ContractDirection.ACTIVE);
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

  // Decisioni effettive per i contratti attivi (esistenti + da creare oggi).
  const decisionByGrant = new Map(input.decisions.map((d) => [d.grant_id, d]));
  const activeGrants = input.utilityActive ? grants.filter((g) => isGrantActive(g, today)) : [];
  const decisions = new Map<number, DecisionLike>();
  for (const g of activeGrants) {
    let d = decisionByGrant.get(g.id);
    if (!d) {
      const renewal = holder !== null && g.party_ids.includes(holder);
      const row = {
        grant_id: g.id,
        decision: renewal ? GrantUtilityDecisionValue.FOLLOWS : null,
        third_party_id: renewal ? holder : null,
      };
      plan.createDecisions.push(row);
      d = { ...row, create_date: today };
    }
    decisions.set(g.id, d);
  }

  // Contratti ancora da decidere: decisione vuota o FOLLOWS senza parte scelta.
  const undecided = activeGrants.filter((g) => {
    const d = decisions.get(g.id) as DecisionLike;
    if (d.decision === null) return true;
    return d.decision === GrantUtilityDecisionValue.FOLLOWS && followsParty(g, d) === null;
  });

  // Obiettivo: parte del contratto FOLLOWS iniziato per ultimo; nessuno = Comune.
  const follows = activeGrants
    .filter((g) => {
      const d = decisions.get(g.id) as DecisionLike;
      return d.decision === GrantUtilityDecisionValue.FOLLOWS && followsParty(g, d) !== null;
    })
    .sort(byStartDesc);
  const winner = follows[0] ?? null;
  const target = winner ? followsParty(winner, decisions.get(winner.id) as DecisionLike) : null;
  plan.overriddenGrantIds = follows
    .slice(1)
    .filter((g) => followsParty(g, decisions.get(g.id) as DecisionLike) !== target)
    .map((g) => g.id);

  const transferReason = (e: SupplyEventLike): string => {
    if (!input.utilityActive) return CANCEL_UTILITY_INACTIVE;
    const g = grantById.get(e.utilizer_grant_id_fk as number);
    if (!g || !isGrantActive(g, today)) return CANCEL_GRANT_ENDED;
    if (decisions.get(g.id)?.decision === GrantUtilityDecisionValue.STAYS) return CANCEL_STAYS;
    return CANCEL_OTHER_PARTY;
  };
  const returnReason = (): string => {
    if (!input.utilityActive) return CANCEL_UTILITY_INACTIVE;
    if (target !== null && target !== holder) return CANCEL_OTHER_PARTY;
    return CANCEL_ALREADY_HOLDER;
  };
  const autoTransfers = autoPending.filter((e) => e.type === SupplyEventType.TRANSFER);
  const autoReturns = autoPending.filter((e) => e.type === SupplyEventType.RETURN);

  if (!input.utilityActive || target === holder) {
    for (const e of autoTransfers) cancel(e, transferReason(e));
    for (const e of autoReturns) cancel(e, returnReason());
  } else if (target !== null) {
    // Voltura verso l'obiettivo, anche direttamente da un'altra parte.
    for (const e of autoTransfers) if (e.third_party_id_fk !== target) cancel(e, transferReason(e));
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
    if (!hasReturn && undecided.length === 0) {
      const grantId = returnGrantId(grants, decisions, holder as number, today);
      if (grantId !== null) {
        plan.createEvents.push({ type: 'RETURN', third_party_id: null, grant_id: grantId });
      }
    }
  }

  // Stato «A carico di» dopo il piano.
  const cancelled = new Set(plan.cancelEvents.map((c) => c.id));
  const remaining = live.filter((e) => !cancelled.has(e.id));
  const has = (type: SupplyEventType) =>
    remaining.some((e) => e.type === type) ||
    plan.createEvents.some((e) => (e.type as string) === type);
  if (undecided.length > 0) plan.costStatus = CostStatus.TO_DECIDE;
  else if (has(SupplyEventType.TRANSFER)) plan.costStatus = CostStatus.TO_TRANSFER;
  else if (has(SupplyEventType.RETURN)) plan.costStatus = CostStatus.TO_RECOVER;
  else if (holder !== null) plan.costStatus = CostStatus.TRANSFERRED;

  // Data evento più vecchia, mai prima della creazione della riga.
  const dates: string[] = [];
  for (const g of undecided) {
    const created = day10((decisions.get(g.id) as DecisionLike).create_date);
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

// Contratto a cui collegare il RETURN: il finito/STAYS che intestava l'holder
// (iniziato per ultimo), altrimenti il contratto finito più di recente.
function returnGrantId(
  grants: GrantLike[],
  decisions: Map<number, DecisionLike>,
  holder: number,
  today: string,
): number | null {
  const released = grants.filter(
    (g) =>
      !isGrantActive(g, today) || decisions.get(g.id)?.decision === GrantUtilityDecisionValue.STAYS,
  );
  const withHolder = released.filter((g) => g.party_ids.includes(holder)).sort(byStartDesc);
  if (withHolder.length) return withHolder[0].id;
  const ended = grants
    .filter((g) => !isGrantActive(g, today))
    .map((g) => ({ g, end: grantEndDay(g, today) ?? '' }))
    .sort((a, b) => (a.end !== b.end ? (a.end < b.end ? 1 : -1) : b.g.id - a.g.id));
  return ended.length ? ended[0].g.id : null;
}
