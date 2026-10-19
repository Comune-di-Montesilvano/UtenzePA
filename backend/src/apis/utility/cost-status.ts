import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';
import { grantLabel } from '@apis/utility-supply/grant-label';
import {
  GrantUtilityDecisionValue,
  SupplyEventType,
} from '@apis/utility-supply/enum/supply-event-type.enum';

// "A carico di": lo stato è salvato in utilities.cost_status e scritto solo
// da SupplyReconcileService (apis/utility-supply) a partire dallo storico
// dell'utenza e dalle decisioni sui contratti. Qui solo lettura:
// costStatusSql filtra sulla colonna, costInfo prepara la vista per la scheda.
export enum CostStatus {
  COMUNE = 'COMUNE',
  TO_TRANSFER = 'TO_TRANSFER',
  TRANSFERRED = 'TRANSFERRED',
  TO_RECOVER = 'TO_RECOVER',
  TO_DECIDE = 'TO_DECIDE',
}

export interface CostInfo {
  status: CostStatus;
  // Intestatario attuale (voltura in corso di validità).
  holder: { id: number; name: string } | null;
  holder_since: string | null;
  // Cosa è in sospeso e da quanti giorni (giorno di Roma).
  pending: { type: SupplyEventType | 'DECISION'; since: string; days: number } | null;
  // Contratti attivi sull'immobile con la decisione per questa utenza.
  grants: { grant_id: number; name: string; decision: GrantUtilityDecisionValue | null }[];
}

interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  direction?: ContractDirection | null;
  subject?: string | null;
  concession_act?: string | null;
  decision?: GrantUtilityDecisionValue | null;
}

export interface CostInput {
  cost_status?: CostStatus | null;
  pending_since?: string | null;
  transferred_to_third_party_id?: number | null;
  transferredTo?: PartyFields | null;
  transferred_on?: string | null;
  // Opzionale: findAll non li carica (evita N+1).
  assets?: { utilizerGrants?: GrantLike[] | null }[] | null;
}

const isActive = (g: GrantLike) =>
  !g.deleted && g.status === ContractStatus.ACTIVE && g.direction === ContractDirection.ACTIVE;

// Le date arrivano già come 'AAAA-MM-GG' (il servizio le normalizza con dbDay).
const day10 = (value: string | null | undefined): string | null =>
  value ? String(value).slice(0, 10) : null;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const PENDING_TYPE_BY_STATUS: Partial<Record<CostStatus, SupplyEventType | 'DECISION'>> = {
  [CostStatus.TO_DECIDE]: 'DECISION',
  [CostStatus.TO_TRANSFER]: SupplyEventType.TRANSFER,
  [CostStatus.TO_RECOVER]: SupplyEventType.RETURN,
};

export function costInfo(utility: CostInput, today: string): CostInfo {
  const status = utility.cost_status ?? CostStatus.COMUNE;
  const toId = utility.transferred_to_third_party_id ?? null;

  const grants: CostInfo['grants'] = [];
  const seen = new Set<number>();
  for (const asset of utility.assets ?? []) {
    for (const g of asset?.utilizerGrants ?? []) {
      if (!isActive(g) || seen.has(g.id)) continue;
      seen.add(g.id);
      grants.push({ grant_id: g.id, name: grantLabel(g), decision: g.decision ?? null });
    }
  }

  const since = day10(utility.pending_since);
  // Il tipo dipende solo dallo stato: coerente con cost_status.
  const type = PENDING_TYPE_BY_STATUS[status] ?? null;
  const pending =
    since && type ? { type, since, days: Math.max(0, daysBetween(since, today)) } : null;

  return {
    status,
    holder:
      toId === null
        ? null
        : { id: toId, name: utility.transferredTo ? partyName(utility.transferredTo) : '' },
    holder_since: toId === null ? null : day10(utility.transferred_on),
    pending,
    grants,
  };
}

export function costStatusSql(status: CostStatus, alias = 'Utility'): string {
  return `${alias}.cost_status = '${status}'`;
}
