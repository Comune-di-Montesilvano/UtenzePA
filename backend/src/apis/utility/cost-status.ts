import {
  ContractDirection,
  ContractStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';

// "A carico di" calcolato (roadmap voce 12). Contratto attivo = contratto
// immobiliare in corso concesso dal Comune su un immobile dell'utenza; con
// voltura = attivo con "Utenze da volturare". Stato:
// - non volturata, nessun contratto con voltura → COMUNE
// - non volturata, contratto con voltura → TO_TRANSFER (paga il Comune finché il terzo non volta)
// - volturata a una parte di un contratto attivo → TRANSFERRED
// - volturata a chi non ha più un contratto attivo → TO_RECOVER
// costStatusSql è la stessa regola in SQL: tenerle allineate.
export enum CostStatus {
  COMUNE = 'COMUNE',
  TO_TRANSFER = 'TO_TRANSFER',
  TRANSFERRED = 'TRANSFERRED',
  TO_RECOVER = 'TO_RECOVER',
}

export interface CostParty {
  grant_id: number;
  third_party_id: number;
  name: string;
}

export interface CostInfo {
  status: CostStatus;
  // Parti dei contratti con voltura (chi deve volturare).
  parties: CostParty[];
  // Parti di tutti i contratti attivi: a chi si può volturare.
  active_parties: CostParty[];
  transferred_to: { id: number; name: string } | null;
  transferred_on: string | Date | null;
}

interface PartyLike extends PartyFields {
  id: number;
  deleted?: boolean | number | null;
}

// MySQL tinyint: flag e deleted possono arrivare come 1/0.
interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  direction?: ContractDirection | null;
  utilities_to_be_taken_over?: boolean | number | null;
  parties?: PartyLike[] | null;
}

export interface CostInput {
  assets?: { utilizerGrants?: GrantLike[] | null }[] | null;
  transferred_to_third_party_id?: number | null;
  transferredTo?: PartyLike | null;
  transferred_on?: string | Date | null;
}

const isActive = (g: GrantLike) =>
  !g.deleted && g.status === ContractStatus.ACTIVE && g.direction === ContractDirection.ACTIVE;

export function costInfo(utility: CostInput): CostInfo {
  const grants = (utility.assets ?? []).flatMap((a) => a?.utilizerGrants ?? []).filter(isActive);
  const partiesOf = (list: GrantLike[]): CostParty[] => {
    const result: CostParty[] = [];
    const seen = new Set<string>();
    for (const grant of list) {
      for (const p of grant.parties ?? []) {
        const key = `${grant.id}:${p.id}`;
        if (p.deleted || seen.has(key)) continue;
        seen.add(key);
        result.push({ grant_id: grant.id, third_party_id: p.id, name: partyName(p) });
      }
    }
    return result;
  };
  const parties = partiesOf(grants.filter((g) => !!g.utilities_to_be_taken_over));
  const activeParties = partiesOf(grants);

  const toId = utility.transferred_to_third_party_id ?? null;
  const transferredOn = utility.transferred_on ?? null;
  if (toId === null) {
    return {
      status: parties.length ? CostStatus.TO_TRANSFER : CostStatus.COMUNE,
      parties,
      active_parties: activeParties,
      transferred_to: null,
      transferred_on: transferredOn,
    };
  }
  const hasTitle = activeParties.some((p) => p.third_party_id === toId);
  return {
    status: hasTitle ? CostStatus.TRANSFERRED : CostStatus.TO_RECOVER,
    parties,
    active_parties: activeParties,
    transferred_to: {
      id: toId,
      name: utility.transferredTo ? partyName(utility.transferredTo) : '',
    },
    transferred_on: transferredOn,
  };
}

// Contratti attivi su immobili (non cancellati) dell'utenza, con parti non cancellate.
const activeGrantParties = (alias: string, extra: string) =>
  `SELECT 1 FROM utility_assets ua
     JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
     JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
     JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id
       AND g.deleted = 0 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'
     JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
     JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
   WHERE ua.utility_id = ${alias}.id AND ${extra}`;

export function costStatusSql(status: CostStatus, alias = 'Utility'): string {
  const transferredTo = `${alias}.transferred_to_third_party_id`;
  const withTransfer = activeGrantParties(alias, 'g.utilities_to_be_taken_over = 1');
  const withTitle = activeGrantParties(alias, `tp.id = ${transferredTo}`);
  switch (status) {
    case CostStatus.COMUNE:
      return `(${transferredTo} IS NULL AND NOT EXISTS (${withTransfer}))`;
    case CostStatus.TO_TRANSFER:
      return `(${transferredTo} IS NULL AND EXISTS (${withTransfer}))`;
    case CostStatus.TRANSFERRED:
      return `(${transferredTo} IS NOT NULL AND EXISTS (${withTitle}))`;
    case CostStatus.TO_RECOVER:
      return `(${transferredTo} IS NOT NULL AND NOT EXISTS (${withTitle}))`;
  }
}
