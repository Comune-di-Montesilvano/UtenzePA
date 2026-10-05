import type {SignalDef} from '../../core/components/list/list-signals.component';
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import type {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {StringHelper} from '../../core/helpers/string.helper';
import {DIRECTION_LABEL, KIND_LABEL, STATUS_LABEL} from './real-estate-contract.model';

const options = <K extends string>(labels: Record<K, string>): TOption[] =>
  (Object.keys(labels) as K[]).map(value => ({value, label: labels[value]}));
const byLabel = (a: TOption, b: TOption) => (a.label ?? '').localeCompare(b.label ?? '');

// Filtri dell'elenco contratti immobiliari. "Segnalazione" = link dalla dashboard (?alert=...).
// Da chiamare in un injection context.
export function grantFilters(): FilterDef[] {
  const assets = inject(AssetService);
  const parties = inject(ThirdPartiesService);
  return [
    {key: 'computed_status', label: 'Stato', type: 'select', inline: true, options: options(STATUS_LABEL)},
    {key: 'direction', label: 'Direzione', type: 'select', inline: true, options: options(DIRECTION_LABEL)},
    {key: 'kind', label: 'Tipo', type: 'select', inline: true, options: options(KIND_LABEL)},

    {key: 'alert', label: 'Segnalazione', type: 'select', group: 'Segnalazioni', options: [
      {label: 'Disdetta entro 60 giorni', value: 'notice'},
      {label: 'In scadenza entro 4 mesi', value: 'expiring'},
      {label: 'Scaduti ancora attivi', value: 'expired_active'},
      {label: 'Senza immobile', value: 'without_assets'},
    ]},

    {key: 'asset_id', label: 'Immobile', type: 'select', group: 'Collegamenti',
      options: () => assets.search({deleted: false}).pipe(map(list => list.map(a => ({label: a.asset_name, value: a.id})).sort(byLabel)))},
    {key: 'party_id', label: 'Parte', type: 'select', group: 'Collegamenti',
      options: () => parties.search({deleted: false, roles: `${PartyRole.LESSOR},${PartyRole.TENANT}`} as never).pipe(
        map(list => list.map(p => ({label: StringHelper.truncateAt(partyName(p), 50), value: p.id})).sort(byLabel)))},

    {key: 'department', label: 'Settore', type: 'text', group: 'Dati contratto'},
    {key: 'concession_act', label: 'Atto', type: 'text', group: 'Dati contratto'},
    {key: 'utilities_to_be_taken_over', label: 'Utenze da volturare', type: 'bool', group: 'Dati contratto'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const GRANT_SIGNALS: SignalDef[] = [
  {key: 'real_estate_contracts_without_assets', label: 'Senza immobile'},
  {key: 'real_estate_contracts_without_parties', label: 'Senza parti'},
];
