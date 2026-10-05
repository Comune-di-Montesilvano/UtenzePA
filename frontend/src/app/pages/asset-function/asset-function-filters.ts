import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';

// Filtri dell'elenco funzioni immobili.
export function assetFunctionFilters(): FilterDef[] {
  return [
    {key: 'name', label: 'Nome', type: 'text'},
    DELETED_FILTER,
  ];
}
