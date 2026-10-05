import type {SignalDef} from '../../core/components/list/list-signals.component';
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {AssetService} from './asset.service';
import {AssetNaturesService} from '../asset-nature/asset-nature.service';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {ASSET_STATUS_OPTIONS} from './enum/asset-status.enum';

// Filtri dell'elenco immobili. Da chiamare in un injection context.
export function assetFilters(): FilterDef[] {
  const assets = inject(AssetService);
  const natures = inject(AssetNaturesService);
  const functions = inject(AssetFunctionsService);
  return [
    {key: 'nature_id', label: 'Tipologia', type: 'select', inline: true,
      options: () => natures.search({deleted: false} as never).pipe(map(list =>
        list.map(n => ({label: n.name, value: n.id, icon: n.icon ?? undefined}))))},
    {key: 'function_id', label: 'Funzione', type: 'select', inline: true,
      options: () => functions.search({deleted: false} as never).pipe(map(list =>
        list.map(f => ({label: f.name, value: f.id, icon: f.icon ?? undefined}))))},
    {key: 'status', label: 'Stato', type: 'select', inline: true, options: ASSET_STATUS_OPTIONS},

    {key: 'legacy_only', label: 'Da classificare', type: 'bool', group: 'Segnalazioni'},

    {key: 'asset_name', label: 'Nome immobile', type: 'text', group: 'Immobile'},
    {key: 'ownership', label: 'Proprietà', type: 'select', group: 'Immobile',
      options: [{label: 'Sì', value: 1}, {label: 'No', value: 0}]},
    {key: 'services_and_artifacts', label: 'Servizi/manufatti', type: 'text', group: 'Immobile'},
    {key: 'associated_building', label: 'Descrizione fabbricato', type: 'text', group: 'Immobile'},

    {key: 'toponym', label: 'Toponimo', type: 'select', group: 'Indirizzo', options: assets.toponymOptions()},
    {key: 'address', label: 'Indirizzo', type: 'text', group: 'Indirizzo'},
    {key: 'civic_number', label: 'Civico', type: 'text', group: 'Indirizzo'},
    {key: 'municipality', label: 'Comune', type: 'text', group: 'Indirizzo'},
    {key: 'zip_code', label: 'CAP', type: 'text', group: 'Indirizzo'},
    {key: 'latitude', label: 'Latitudine', type: 'text', group: 'Indirizzo'},
    {key: 'longitude', label: 'Longitudine', type: 'text', group: 'Indirizzo'},

    {key: 'category', label: "Categoria (destinazione d'uso)", type: 'select', group: 'Catasto', options: assets.categoryOptions()},
    {key: 'sheet', label: 'Foglio', type: 'text', group: 'Catasto'},
    {key: 'parcel', label: 'Particella (mappale)', type: 'text', group: 'Catasto'},
    {key: 'subordinate', label: 'Subalterno', type: 'text', group: 'Catasto'},
    {key: 'cadastral_value', label: 'Valore catastale', type: 'number', group: 'Catasto'},
    {key: 'area_sqm', label: 'Superficie (mq)', type: 'number', group: 'Catasto'},

    {key: 'specific_details', label: 'Specifiche', type: 'text', group: 'Altro'},
    {key: 'memo', label: 'Promemoria', type: 'text', group: 'Altro'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const ASSET_SIGNALS: SignalDef[] = [
  {key: 'assets_without_classification', label: 'Da classificare (tipologia o funzione mancanti)'},
];
