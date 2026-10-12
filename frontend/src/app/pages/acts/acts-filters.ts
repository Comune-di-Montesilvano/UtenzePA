import {Observable, map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import type {TOption} from '../../core/types/option.interface';
import type {ActType} from './act.model';

// Filtri dell'elenco atti (lato server); la ricerca libera resta lato client.
export function actFilters(types: () => Observable<ActType[]>): FilterDef[] {
  const year = new Date().getFullYear();
  return [
    {key: 'act_type_id', label: 'Tipo', type: 'select', inline: true,
      options: () => types().pipe(map(ts => ts.map((t): TOption => ({label: t.name, value: t.id}))))},
    {key: 'linked_to', label: 'Collegato a', type: 'select', inline: true, options: [
      {label: 'Immobili', value: 'asset'},
      {label: 'Impianti', value: 'plant'},
      {label: 'Contratti immobiliari', value: 'utilizer_grant'},
      {label: 'Contratti di fornitura', value: 'contract'},
      {label: 'Nessuna entità', value: 'none'},
    ]},
    {key: 'year', label: 'Anno', type: 'select', inline: true,
      options: Array.from({length: 60}, (_, i) => ({label: String(year - i), value: year - i}))},
    {key: 'without_files', label: 'Senza file', type: 'bool'},
    DELETED_FILTER,
  ];
}
