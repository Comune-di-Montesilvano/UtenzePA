import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {PartyRole, ROLE_LABEL, ThirdPartyType, TYPE_LABEL} from './third-party.model';
import {ContractKind, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';

// Filtri dell'elenco soggetti terzi. Ruoli in OR (nessuno = tutti).
export function thirdPartyFilters(): FilterDef[] {
  return [
    {key: 'roles', label: 'Ruolo', type: 'multi', inline: true,
      options: [PartyRole.SUPPLIER, PartyRole.LESSOR, PartyRole.TENANT, PartyRole.UNLINKED]
        .map(role => ({label: ROLE_LABEL[role], value: role}))},
    {key: 'type', label: 'Tipo soggetto', type: 'select', inline: true,
      options: Object.values(ThirdPartyType).map(t => ({label: TYPE_LABEL[t], value: t}))},
    {key: 'kind', label: 'Tipo contratto immobiliare', type: 'select', group: 'Contratti immobiliari',
      options: (Object.keys(KIND_LABEL) as ContractKind[]).map(k => ({label: KIND_LABEL[k], value: k}))},
    DELETED_FILTER,
  ];
}
