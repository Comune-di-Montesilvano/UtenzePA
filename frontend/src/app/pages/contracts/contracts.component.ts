import {Component, ChangeDetectionStrategy, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {DataTableContractsComponent} from './data-table-contracts.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {contractFilters} from './contracts-filters';
import {ContractsService} from './contract.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Contract} from './entity/contract.entity';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [DataTableContractsComponent, ListFiltersComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contracts.component.html'
})
export class ContractsComponent extends AbstractComponent<Contract> {

  @ViewChild('dataTable') dataTable?: DataTableContractsComponent;

  constructor(protected override service: ContractsService, private route: ActivatedRoute) {
    super();
  }

  override filterDefs = contractFilters();

  // Link dalla dashboard: query param dei filtri (missing_cig, supply_expiry_date_range),
  // ?selectedId=N apre il contratto.
  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }

  protected override getEntityIdentifier(entity: Contract): string {
    return entity.cig_contract ?? 'CIG non specificato';
  }

  protected override entityLabel(): string {
    return 'Contratto di fornitura';
  }
}
