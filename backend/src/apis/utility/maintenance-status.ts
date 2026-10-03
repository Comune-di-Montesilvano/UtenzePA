import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyFields, partyName } from '@apis/third-parties/third-party.name';

// "Manutenzione a carico di" calcolata (roadmap voce 18). In ordine:
// - contratto di fornitura aperto con "Manutenzione inclusa" → SUPPLIER
// - contratto immobiliare attivo (qualsiasi direzione) con "Manutenzione a
//   carico della controparte" su un immobile dell'utenza → COUNTERPARTY
// - altrimenti → COMUNE
// maintenanceStatusSql è la stessa regola in SQL: tenerle allineate.
export enum MaintenanceStatus {
  COMUNE = 'COMUNE',
  SUPPLIER = 'SUPPLIER',
  COUNTERPARTY = 'COUNTERPARTY',
}

export interface MaintenanceInfo {
  status: MaintenanceStatus;
  // Contratti di fornitura con manutenzione inclusa (nome = fornitore).
  contracts: { id: number; name: string }[];
  // Parti dei contratti immobiliari con manutenzione a carico della controparte.
  parties: { grant_id: number; third_party_id: number; name: string }[];
}

interface PartyLike extends PartyFields {
  id: number;
  deleted?: boolean | number | null;
}

// MySQL tinyint: flag, closed e deleted possono arrivare come 1/0.
interface SupplyContractLike {
  id: number;
  deleted?: boolean | number | null;
  closed?: boolean | number | null;
  maintenance_included?: boolean | number | null;
  supplier?: PartyLike | null;
}

interface GrantLike {
  id: number;
  deleted?: boolean | number | null;
  status?: ContractStatus | null;
  maintenance_by_counterparty?: boolean | number | null;
  parties?: PartyLike[] | null;
}

export interface MaintenanceInput {
  contratti?: SupplyContractLike[] | null;
  assets?: { utilizerGrants?: GrantLike[] | null }[] | null;
}

export function maintenanceInfo(utility: MaintenanceInput): MaintenanceInfo {
  const contracts = (utility.contratti ?? [])
    .filter((c) => !c.deleted && !c.closed && !!c.maintenance_included)
    .map((c) => ({ id: c.id, name: c.supplier ? partyName(c.supplier) : '' }));
  if (contracts.length) return { status: MaintenanceStatus.SUPPLIER, contracts, parties: [] };

  const parties: MaintenanceInfo['parties'] = [];
  const seen = new Set<string>();
  for (const grant of (utility.assets ?? []).flatMap((a) => a?.utilizerGrants ?? [])) {
    if (grant.deleted || grant.status !== ContractStatus.ACTIVE) continue;
    if (!grant.maintenance_by_counterparty) continue;
    for (const p of grant.parties ?? []) {
      const key = `${grant.id}:${p.id}`;
      if (p.deleted || seen.has(key)) continue;
      seen.add(key);
      parties.push({ grant_id: grant.id, third_party_id: p.id, name: partyName(p) });
    }
  }
  return {
    status: parties.length ? MaintenanceStatus.COUNTERPARTY : MaintenanceStatus.COMUNE,
    contracts: [],
    parties,
  };
}

const supplierSql = (alias: string) =>
  `SELECT 1 FROM contract_utilities cu
     JOIN contracts c ON c.id = cu.contract_id
       AND c.deleted = 0 AND c.closed = 0 AND c.maintenance_included = 1
   WHERE cu.utility_id = ${alias}.id`;

// Contratti immobiliari attivi, in entrambe le direzioni, su immobili non
// cancellati dell'utenza, con parti non cancellate.
const counterpartySql = (alias: string) =>
  `SELECT 1 FROM utility_assets ua
     JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
     JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
     JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id
       AND g.deleted = 0 AND g.status = 'ACTIVE' AND g.maintenance_by_counterparty = 1
     JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
     JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
   WHERE ua.utility_id = ${alias}.id`;

export function maintenanceStatusSql(status: MaintenanceStatus, alias = 'Utility'): string {
  const supplier = supplierSql(alias);
  const counterparty = counterpartySql(alias);
  switch (status) {
    case MaintenanceStatus.SUPPLIER:
      return `(EXISTS (${supplier}))`;
    case MaintenanceStatus.COUNTERPARTY:
      return `(NOT EXISTS (${supplier}) AND EXISTS (${counterparty}))`;
    case MaintenanceStatus.COMUNE:
      return `(NOT EXISTS (${supplier}) AND NOT EXISTS (${counterparty}))`;
  }
}
