import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import type {SignalDef} from '../../core/components/list/list-signals.component';
import {partyName} from '../../core/helpers/party-name.helper';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {ContractsService} from '../contracts/contract.service';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';

const byLabel = (a: {label: string}, b: {label: string}) => (a.label ?? '').localeCompare(b.label ?? '', 'it');

// Filtri dell'elenco impegni (parametri di GET /commitments). Da chiamare in un injection context.
export function commitmentFilters(): FilterDef[] {
  const chapters = inject(BudgetChaptersService);
  const parties = inject(ThirdPartiesService);
  const agreements = inject(ConsipAgreementService);
  const contracts = inject(ContractsService);
  const year = new Date().getFullYear();
  return [
    {key: 'fiscal_year', label: 'Competenza', type: 'select', inline: true,
      options: Array.from({length: year - 2020}, (_, i) => year + 1 - i).map(y => ({label: String(y), value: y}))},
    {key: 'budget_chapter_id', label: 'Capitolo', type: 'select', inline: true,
      options: () => chapters.search({deleted: false}).pipe(map(list => list
        .map(b => ({label: `${b.chapter_code}/${b.article ?? 0} - ${b.description ?? ''}`, value: b.id}))
        .sort(byLabel)))},
    {key: 'supplier_id', label: 'Fornitore', type: 'select', inline: true,
      options: () => parties.search({deleted: false, roles: PartyRole.SUPPLIER} as never).pipe(
        map(list => list.map(p => ({label: partyName(p), value: p.id})).sort(byLabel)))},
    {key: 'consip_agreement_id', label: 'Convenzione', type: 'select', group: 'Collegamenti',
      options: () => agreements.search({deleted: false} as never).pipe(
        map(list => list.map(a => ({label: a.name, value: a.id})).sort(byLabel)))},
    {key: 'contract_id', label: 'Contratto di fornitura', type: 'select', group: 'Collegamenti',
      options: () => contracts.search({deleted: false}).pipe(map(list => list
        .map(c => ({label: c.cig_contract || `Contratto senza CIG (id ${c.id})`, value: c.id}))
        .sort(byLabel)))},
    DELETED_FILTER,
  ];
}

// Segnalazioni dell'elenco (anomalie della dashboard).
export const COMMITMENT_SIGNALS: SignalDef[] = [
  {key: 'commitments_overspent', label: 'Sforati'},
  {key: 'commitments_without_contract', label: 'Senza contratto'},
  {key: 'commitments_without_amount', label: 'Senza importo'},
];
