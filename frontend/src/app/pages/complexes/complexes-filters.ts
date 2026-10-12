import {FilterDef} from '../../core/components/list/filter-def';
import {COMPLEX_TYPE_LABEL, COMPLEX_TYPES} from './complex.model';

// Filtri dell'elenco complessi (lato server); la ricerca libera resta lato client.
export function complexFilters(): FilterDef[] {
  return [
    {key: 'complex_type', label: 'Tipo', type: 'select', inline: true,
      options: COMPLEX_TYPES.map(t => ({label: COMPLEX_TYPE_LABEL[t], value: t}))},
  ];
}
