import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import type {SignalDef} from '../../core/components/list/list-signals.component';
import {UtilityTypesService} from '../utility-types/utility-types.service';

// Filtri dell'elenco capitoli di spesa.
export function budgetChapterFilters(): FilterDef[] {
  const types = inject(UtilityTypesService);
  return [
    {key: 'utility_type_id', label: 'Tipo utenza', type: 'select', inline: true,
      options: () => types.search({deleted: false}).pipe(
        map(list => list.map(t => ({label: t.name, value: t.id})).sort((a, b) => a.label.localeCompare(b.label, 'it'))))},
    {key: 'chapter_code', label: 'Codice capitolo', type: 'text', group: 'Capitolo'},
    {key: 'article', label: 'Articolo', type: 'text', group: 'Capitolo'},
    {key: 'pdc', label: 'PDC', type: 'text', group: 'Capitolo'},
    {key: 'description', label: 'Descrizione', type: 'text', group: 'Capitolo'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard), sull'esercizio in corso.
export const CHAPTER_SIGNALS: SignalDef[] = [
  {key: 'chapters_over_budget', label: "Oltre l'assestato dell'anno"},
  {key: 'chapters_without_budget', label: "Senza assestato dell'anno"},
];
