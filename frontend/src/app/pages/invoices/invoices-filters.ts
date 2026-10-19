import type {SignalDef} from '../../core/components/list/list-signals.component';
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {ContractsService} from '../contracts/contract.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {UtilityService} from '../utilities/utility.service';
import {SDI_STATUS_LABELS, SDI_STATUS_NONE, SdiStatus} from './sdi-status';
import {IMPORT_ISSUE_LABELS, INVOICE_ISSUE_SIGNAL_TYPES} from '../invoice-import/import-issues';

const byLabel = (a: {label: string}, b: {label: string}) => (a.label ?? '').localeCompare(b.label ?? '');

// Filtri dell'elenco fatture. "Anno" e "Data fattura" diventano invoice_date_from/to
// in InvoicesComponent.mapSearchParams. Da chiamare in un injection context.
export function invoiceFilters(): FilterDef[] {
  const contracts = inject(ContractsService);
  const chapters = inject(BudgetChaptersService);
  const utilities = inject(UtilityService);
  const year = new Date().getFullYear();
  return [
    {key: 'contratto_id_fk', label: 'Contratto di fornitura', type: 'select', inline: true,
      options: () => contracts.search({deleted: false}).pipe(map(list => list
        .map(c => ({label: c.cig_contract || `Contratto senza CIG (id ${c.id})`, value: c.id}))
        .sort(byLabel)))},
    {key: 'year', label: 'Anno', type: 'select', inline: true,
      options: Array.from({length: year - 2018}, (_, i) => year - i).map(y => ({label: String(y), value: y}))},
    {key: 'sdi_status', label: 'Stato SDI', type: 'select', inline: true,
      options: [
        ...Object.values(SdiStatus).map(s => ({label: SDI_STATUS_LABELS[s], value: s})),
        {label: 'Senza messaggio SDI', value: SDI_STATUS_NONE},
      ]},
    {key: 'invoice_id', label: 'Numero fattura', type: 'text', group: 'Documento'},
    {key: 'protocol_number', label: 'Numero protocollo', type: 'text', group: 'Documento'},
    {key: 'notes_on_invoices', label: 'Note', type: 'text', group: 'Documento'},
    {key: 'utility_id', label: 'Utenza', type: 'select', group: 'Righe',
      options: () => utilities.search({deleted: false}).pipe(map(list => list
        .map(u => ({label: u.utility_id, value: u.id, sublabel: u.utilityType?.name, searchText: `${u.utility_id} ${u.utility_code ?? ''}`}))
        .sort(byLabel)))},
    {key: 'budget_chapter_ids', label: 'Capitoli (da impegni delle righe)', type: 'multi', group: 'Righe',
      options: () => chapters.search({deleted: false}).pipe(map(list => list
        .map(b => ({label: `${b.chapter_code} - ${b.description}`, value: b.id}))
        .sort(byLabel)))},
    {key: 'invoice_date_range', label: 'Data fattura', type: 'dateRange', group: 'Date'},
    {key: 'net_amount_excl_vat', label: 'Imponibile (€)', type: 'number', group: 'Importi'},
    {key: 'last_invoice_arrears', label: 'Morosità (€)', type: 'number', group: 'Importi'},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const INVOICE_SIGNALS: SignalDef[] = [
  {key: 'invoices_outside_supply_periods', label: 'Fuori dai periodi di attività', ids: items => items.map(i => i.invoice_id)},
  {key: 'invoice_lines_without_utility', label: 'Con righe senza utenza', ids: items => items.map(i => i.invoice_id)},
  {key: 'invoice_sdi_outcome_discarded', label: 'Esito scartato dallo SDI', ids: items => items.map(i => i.invoice_id)},
  // Differenze trovate dall'import fatture dalla PEC: una voce per tipo.
  ...INVOICE_ISSUE_SIGNAL_TYPES.map((type): SignalDef => ({
    key: 'invoice_import_issues',
    id: `invoice_import_issues:${type}`,
    label: IMPORT_ISSUE_LABELS[type],
    ids: items => items.filter(i => i.type === type).map(i => i.invoice_id),
  })),
];
