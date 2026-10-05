import {FilterDef} from '../../core/components/list/filter-def';
import {PLANT_STATUS_LABEL, PLANT_TYPE_ICON, PLANT_TYPE_LABEL, PLANT_TYPES, PlantStatus} from './plant.model';

// Filtri dell'elenco impianti (lato server); la ricerca libera resta lato client.
export function plantFilters(): FilterDef[] {
  return [
    {key: 'type', label: 'Tipo', type: 'select', inline: true,
      options: PLANT_TYPES.map(t => ({label: PLANT_TYPE_LABEL[t], value: t, icon: PLANT_TYPE_ICON[t]}))},
    {key: 'status', label: 'Stato', type: 'select', inline: true,
      options: (Object.keys(PLANT_STATUS_LABEL) as PlantStatus[]).map(s => ({label: PLANT_STATUS_LABEL[s], value: s}))},
    {key: 'inspection', label: 'Verifiche', type: 'select', inline: true,
      options: [{label: 'Scadute', value: 'overdue'}, {label: 'Entro 60 giorni', value: 'due_soon'}]},
    {key: 'position', label: 'Posizione', type: 'select', group: 'Posizione',
      options: [{label: 'Precisa', value: 'precise'}, {label: "Dall'immobile", value: 'from_asset'},
        {label: 'Stimata', value: 'estimated'}, {label: 'Assente', value: 'missing'}]},
  ];
}
