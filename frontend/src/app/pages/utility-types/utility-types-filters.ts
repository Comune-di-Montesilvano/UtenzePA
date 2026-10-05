import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {HardTypeOptions} from './enum/hard-type.enum';

// Filtri dell'elenco tipologie uso contatore.
export function utilityTypeFilters(): FilterDef[] {
  return [
    {key: 'hard_type', label: 'Tipo', type: 'select', options: HardTypeOptions},
    {key: 'name', label: 'Nome', type: 'text'},
    {key: 'description', label: 'Descrizione', type: 'text'},
    DELETED_FILTER,
  ];
}
