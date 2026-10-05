import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';

// Filtri dell'elenco convenzioni CONSIP. Da chiamare in un injection context.
export function consipAgreementFilters(): FilterDef[] {
  const parties = inject(ThirdPartiesService);
  return [
    {key: 'supplier_id', label: 'Fornitore', type: 'select', inline: true,
      options: () => parties.search({deleted: false, roles: PartyRole.SUPPLIER} as never).pipe(
        map(list => list.map(p => ({label: partyName(p), value: p.id})).sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'name', label: 'Nome', type: 'text', group: 'Convenzione'},
    {key: 'cig_master', label: 'CIG master', type: 'text', group: 'Convenzione'},
    {key: 'description', label: 'Descrizione', type: 'text', group: 'Convenzione'},
    {key: 'safeguard', label: 'Salvaguardia', type: 'bool', group: 'Convenzione'},
    {key: 'expiration_date_range', label: 'Scadenza', type: 'dateRange', group: 'Date'},
    DELETED_FILTER,
  ];
}
