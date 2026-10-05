import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';

// Filtri dell'elenco tipologie immobili.
export function assetNatureFilters(): FilterDef[] {
  return [
    {key: 'name', label: 'Nome', type: 'text'},
    DELETED_FILTER,
  ];
}
