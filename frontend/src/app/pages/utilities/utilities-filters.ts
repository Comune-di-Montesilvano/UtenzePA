import type {SignalDef} from '../../core/components/list/list-signals.component';
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import type {TOption} from '../../core/types/option.interface';
import {Phase} from './enum/phase.enum';
import {AssetService} from '../assets/asset.service';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {PLANT_TYPE_LABEL, PLANT_TYPES} from '../plants/plant.model';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {ARERA_CATEGORY_LABEL, ARERA_NONE, AreraCategory, GAS_USE_OPTIONS} from './arera-category';
import {INTERNET_TECHNOLOGY_OPTIONS} from './internet-technology';

const byLabel = (a: TOption, b: TOption) => (a.label ?? '').localeCompare(b.label ?? '');

// Filtri dell'elenco utenze. Da chiamare in un injection context.
export function utilityFilters(): FilterDef[] {
  const types = inject(UtilityTypesService);
  const assets = inject(AssetService);
  const functions = inject(AssetFunctionsService);
  const parties = inject(ThirdPartiesService);
  const chapters = inject(BudgetChaptersService);
  const partyOptions = (roles: string) => () => parties.search({deleted: false, roles} as never).pipe(
    map(list => list.map(p => ({label: partyName(p), value: p.id})).sort(byLabel)));
  return [
    {key: 'utility_type_id_fk', label: 'Tipo utenza', type: 'select', inline: true,
      options: () => types.search({deleted: false}).pipe(map(list => list.map(t => ({label: t.name, value: t.id})).sort(byLabel)))},
    {key: 'supply_active', label: 'Fornitura attiva', type: 'bool', inline: true},
    {key: 'supplier_id_fk', label: 'Fornitore', type: 'select', inline: true, options: partyOptions(PartyRole.SUPPLIER)},

    {key: 'utility_id', label: 'Codice (POD/PDR/matricola)', type: 'text', group: 'Identificazione'},
    {key: 'meter_number', label: 'Numero contatore', type: 'text', group: 'Identificazione'},
    {key: 'utility_code', label: 'Codice cliente fornitore', type: 'text', group: 'Identificazione'},
    {key: 'supplier_address', label: 'Indirizzo di fornitura', type: 'text', group: 'Identificazione'},

    {key: 'asset_id', label: 'Immobile', type: 'select', group: 'Collegamenti',
      options: () => assets.search({deleted: false}).pipe(map(list => list.map(a => ({label: a.asset_name, value: a.id})).sort(byLabel)))},
    {key: 'asset_function_ids', label: 'Funzione immobile', type: 'multi', group: 'Collegamenti',
      options: () => functions.search({deleted: false} as never).pipe(map(list => list.map(f => ({label: f.name, value: f.id})).sort(byLabel)))},
    {key: 'plant_types', label: 'Tipo impianto', type: 'multi', group: 'Collegamenti',
      options: PLANT_TYPES.map(t => ({label: PLANT_TYPE_LABEL[t], value: t})).sort(byLabel)},
    {key: 'party_id', label: 'Controparte', type: 'select', group: 'Collegamenti',
      options: partyOptions(`${PartyRole.LESSOR},${PartyRole.TENANT}`)},

    {key: 'arera_category', label: 'Tipologia ARERA', type: 'select', group: 'Caratteristiche tecniche',
      options: [{label: 'Non assegnata', value: ARERA_NONE},
        ...Object.values(AreraCategory).map(c => ({label: ARERA_CATEGORY_LABEL[c], value: c}))]},
    {key: 'gas_use_category', label: "Categoria d'uso gas", type: 'select', group: 'Caratteristiche tecniche',
      options: [{label: 'Non assegnata', value: ARERA_NONE}, ...GAS_USE_OPTIONS]},
    {key: 'power_kw_electric', label: 'Potenza (kW)', type: 'text', group: 'Caratteristiche tecniche'},
    {key: 'voltage_kw_electric', label: 'Tensione (V / kV)', type: 'text', group: 'Caratteristiche tecniche'},
    {key: 'phase_type_electric', label: 'Tipo fase', type: 'select', group: 'Caratteristiche tecniche', options: Phase.options()},
    {key: 'disconnectable', label: 'Disalimentabilità', type: 'select', group: 'Caratteristiche tecniche',
      options: [{label: 'Sì', value: 'true'}, {label: 'No', value: 'false'}, {label: 'Non noto', value: 'unknown'}]},
    {key: 'wbs_gas_element', label: 'WBS gas', type: 'text', group: 'Caratteristiche tecniche'},
    {key: 'internet_technology', label: 'Tecnologia (connettività)', type: 'select', group: 'Caratteristiche tecniche',
      options: INTERNET_TECHNOLOGY_OPTIONS},

    {key: 'meter_removed', label: 'Contatore rimosso', type: 'bool', group: 'Stato'},
    {key: 'meter_verified', label: 'Contatore verificato', type: 'bool', group: 'Stato'},
    {key: 'cost_status', label: 'A carico di', type: 'select', group: 'Stato',
      options: [{label: 'Comune', value: 'COMUNE'}, {label: 'Da volturare', value: 'TO_TRANSFER'},
        {label: 'Volturata', value: 'TRANSFERRED'}, {label: 'Da riprendere', value: 'TO_RECOVER'}]},
    {key: 'maintenance_status', label: 'Manutenzione a carico di', type: 'select', group: 'Stato',
      options: [{label: 'Comune', value: 'COMUNE'}, {label: 'Fornitore', value: 'SUPPLIER'}, {label: 'Controparte', value: 'COUNTERPARTY'}]},

    {key: 'safeguard', label: 'Convenzione CONSIP in salvaguardia', type: 'bool', group: 'Dati contrattuali'},
    {key: 'consip_order', label: 'Numero ordine (ODA)', type: 'text', group: 'Dati contrattuali'},
    {key: 'cig_contract', label: 'CIG contratto', type: 'text', group: 'Dati contrattuali'},
    {key: 'budget_chapter_code_fk', label: 'Capitolo di spesa', type: 'select', group: 'Dati contrattuali',
      options: () => chapters.search({deleted: false}).pipe(map(list => list
        .map(b => ({label: `${b.chapter_code} - ${b.description}`, value: b.id})).sort(byLabel)))},

    {key: 'supply_start_date_range', label: 'Decorrenza', type: 'dateRange', group: 'Date'},
    {key: 'supply_expiry_date_range', label: 'Scadenza affidamento', type: 'dateRange', group: 'Date'},
    {key: 'management_expiry_date_range', label: 'Scadenza gestione', type: 'dateRange', group: 'Date'},
    {key: 'takeover_termination_date_range', label: 'Voltura/cessazione', type: 'dateRange', group: 'Date'},
    {key: 'water_concession_range', label: 'Concessione acqua', type: 'dateRange', group: 'Date'},

    {key: 'estimated_annual_consumption', label: 'Consumo annuo presunto', type: 'text', group: 'Consumi'},
    {key: 'reported_consumption_year', label: 'Consumo annuo comunicato CONSIP', type: 'text', group: 'Consumi'},
    {key: 'security_deposit', label: 'Deposito cauzionale (€)', type: 'number', group: 'Consumi'},

    {key: 'notes', label: 'Note', type: 'text', group: 'Altro'},
    {key: 'latitude', label: 'Latitudine', type: 'text', group: 'Altro'},
    {key: 'longitude', label: 'Longitudine', type: 'text', group: 'Altro'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const UTILITY_SIGNALS: SignalDef[] = [
  {key: 'active_utilities_without_contract', label: 'Attive senza contratto di fornitura valido'},
  {key: 'active_utilities_without_cig_contract', label: 'Attive coperte solo da contratti senza CIG'},
  {key: 'utilities_with_overlapping_contracts', label: 'Con contratti di fornitura sovrapposti'},
  {key: 'active_utilities_without_arera_category', label: 'Attive senza tipologia ARERA'},
  {key: 'active_gas_utilities_without_use_category', label: "Gas attive senza categoria d'uso"},
  {key: 'utilities_to_transfer', label: 'Da volturare'},
  {key: 'utilities_to_recover', label: 'Volturate da riprendere'},
  {key: 'utilities_with_uncommitted_chapter', label: 'Capitolo non impegnato sul contratto di fornitura'},
  {key: 'active_utilities_without_chapter', label: 'Senza capitolo di spesa'},
];
