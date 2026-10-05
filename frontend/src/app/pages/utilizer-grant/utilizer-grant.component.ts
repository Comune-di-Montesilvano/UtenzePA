import {Component, ChangeDetectionStrategy, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {DataTableUtilizerGrantComponent} from './data-table-utilizer-grant.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {grantFilters} from './utilizer-grant-filters';
import {UtilizerGrantService} from './utilizer-grant.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {formatEuro} from './real-estate-contract.model';

@Component({
  selector: 'app-utilizer-grant',
  standalone: true,
  imports: [
    DataTableUtilizerGrantComponent,
    ListFiltersComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilizer-grant.component.html',
})
export class UtilizerGrantComponent extends AbstractComponent<UtilizerGrant> {

  @ViewChild('dataTable') dataTable?: DataTableUtilizerGrantComponent;

  readonly euro = formatEuro;

  constructor(protected override service: UtilizerGrantService, private route: ActivatedRoute) {
    super();
  }

  override filterDefs = grantFilters();

  // Link dalla dashboard: ?alert=notice|expiring|expired_active|without_assets
  // filtra l'elenco, ?selectedId=N apre il contratto.
  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }

  // Totali annui sui contratti visibili, solo attivi o in scadenza.
  totals(): {income: number; expense: number} {
    return this.list.reduce((t, g) => {
      const live = g.computed_status === 'ACTIVE' || g.computed_status === 'EXPIRING';
      if (!live || !g.annual_rent) return t;
      if (g.direction === 'PASSIVE') t.expense += g.annual_rent; else t.income += g.annual_rent;
      return t;
    }, {income: 0, expense: 0});
  }

  protected override entityLabel(): string {
    return 'Contratto immobiliare';
  }

  protected override getEntityIdentifier(entity: UtilizerGrant): string {
    return entity.subject ?? entity.concession_act ?? `#${entity.id}`;
  }

  protected override entityToPayload(entity: UtilizerGrant): Partial<UtilizerGrant> {
    return {
      party_ids: entity.party_ids?.length ? entity.party_ids : (entity.parties ?? []).map(p => p.id),
      asset_ids: entity.asset_ids ?? [],
      direction: entity.direction,
      kind: entity.kind,
      status: entity.status,
      subject: entity.subject ?? null,
      department: entity.department ?? null,
      concession_act: entity.concession_act,
      usage_type: entity.usage_type,
      rent_amount: entity.rent_amount ?? null,
      rent_period: entity.rent_period ?? null,
      vat_applicable: entity.vat_applicable ?? false,
      start_date: entity.start_date ?? null,
      end_date: entity.end_date ?? null,
      tacit_renewal: entity.tacit_renewal ?? false,
      renewal_months: entity.renewal_months ?? null,
      notice_months: entity.notice_months ?? null,
      utilities_to_be_taken_over: entity.utilities_to_be_taken_over,
      registration_ref: entity.registration_ref ?? null,
      cadastral_ref: entity.cadastral_ref ?? null,
      area_sqm: entity.area_sqm ?? null,
      parent_contract_id: entity.parent_contract_id ?? null,
      notes: entity.notes ?? null,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId,
    };
  }
}
