import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetFunction} from './entity/asset-function.entity';
import {AssetFunctionsService} from './asset-function.service';
import {DataTableAssetFunctionComponent} from './data-table-asset-function.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {assetFunctionFilters} from './asset-function-filters';

@Component({
  selector: 'app-asset-function',
  standalone: true,
  imports: [DataTableAssetFunctionComponent, ListFiltersComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-function.component.html'
})
export class AssetFunctionComponent extends AbstractComponent<AssetFunction> {
  @ViewChild('dataTable') dataTable!: DataTableAssetFunctionComponent;

  override filterDefs = assetFunctionFilters();

  constructor(
    protected override service: AssetFunctionsService,
    private route: ActivatedRoute,
  ) {
    super();
    this.qsearchFields = ['name'];
  }

  // ?selectedId=N (link dalla dashboard) apre la scheda della funzione.
  override ngOnInit() {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }

  protected override getEntityIdentifier(entity: AssetFunction): string {
    return entity.name ?? '';
  }

  protected override entityLabel(): string {
    return 'Funzione';
  }

  protected override entityToPayload(entity: AssetFunction): Partial<AssetFunction> {
    return {...AssetFunction.toPayload(entity), created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }
}
