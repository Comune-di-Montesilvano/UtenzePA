import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {SupplyTypeOptions} from './enum/supply-type.enum';

// Filtri dell'elenco capitoli di spesa.
export function budgetChapterFilters(): FilterDef[] {
  return [
    {key: 'supply_type', label: 'Tipo fornitura', type: 'select', inline: true, options: SupplyTypeOptions},
    {key: 'chapter_code', label: 'Codice capitolo', type: 'text', group: 'Capitolo'},
    {key: 'article', label: 'Articolo', type: 'text', group: 'Capitolo'},
    {key: 'pdc', label: 'PDC', type: 'text', group: 'Capitolo'},
    {key: 'description', label: 'Descrizione', type: 'text', group: 'Capitolo'},
    DELETED_FILTER,
  ];
}
