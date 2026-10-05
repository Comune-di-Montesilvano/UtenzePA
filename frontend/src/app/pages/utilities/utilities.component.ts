import {Component, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {UtilityService} from './utility.service';
import {DataTableUtilitiesComponent} from './data-table-utilities.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {utilityFilters} from './utilities-filters';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utility} from './entity/utility.entity';

@Component({
  selector: 'app-utilities',
  standalone: true,
  imports: [DataTableUtilitiesComponent, ListFiltersComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilities.component.html'
})
export class UtilitiesComponent extends AbstractComponent<Utility> {

  @ViewChild('dataTable') dataTable!: DataTableUtilitiesComponent;

  override filterDefs = utilityFilters();

  constructor(
    protected override service: UtilityService,
    private route: ActivatedRoute
  ) {
    super();
  }

  protected override getEntityIdentifier(entity: Utility): string {
    return `${entity.utility_id}`;
  }

  protected override entityLabel(): string {
    return 'Utenza';
  }

  // Link dalla dashboard: query param dei filtri (safeguard, supply_expiry_date_range),
  // ?selectedId=N apre l'utenza.
  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }
}
