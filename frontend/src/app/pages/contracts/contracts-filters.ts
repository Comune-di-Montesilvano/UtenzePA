import type {SignalDef} from '../../core/components/list/list-signals.component';
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';

// Filtri dell'elenco contratti di fornitura. Da chiamare in un injection context.
export function contractFilters(): FilterDef[] {
  const parties = inject(ThirdPartiesService);
  return [
    {key: 'supplier_id_fk', label: 'Fornitore', type: 'select', inline: true,
      options: () => parties.search({deleted: false, roles: PartyRole.SUPPLIER} as never).pipe(
        map(list => list.map(p => ({label: partyName(p), value: p.id})).sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'closed', label: 'Stato', type: 'select', inline: true,
      options: [{label: 'Aperti', value: false}, {label: 'Chiusi', value: true}]},
    {key: 'cig_contract', label: 'CIG', type: 'text', group: 'Dati contratto'},
    {key: 'consip_order', label: 'Numero ordine (ODA)', type: 'text', group: 'Dati contratto'},
    {key: 'supply_expiry_date_range', label: 'Scadenza fornitura', type: 'dateRange', group: 'Date'},
    {key: 'missing_cig', label: 'Senza CIG (non esclusi)', type: 'bool', group: 'Segnalazioni'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const CONTRACT_SIGNALS: SignalDef[] = [
  {key: 'contracts_without_cig', label: 'Senza CIG (non esclusi)'},
  {key: 'duplicate_cigs', label: 'CIG duplicati', ids: items => items.flatMap(i => i.contracts)},
];
