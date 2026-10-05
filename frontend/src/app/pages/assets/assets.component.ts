import {Component, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Asset} from './entity/asset.entity';
import {AssetService} from './asset.service';
import {DataTableAssetsComponent} from './data-table-assets.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {assetFilters, ASSET_SIGNALS} from './assets-filters';
import {ListSignalsComponent} from '../../core/components/list/list-signals.component';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DataTableAssetsComponent, ListFiltersComponent, ListSignalsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './assets.component.html'
})
export class AssetsComponent extends AbstractComponent<Asset> {

  @ViewChild('dataTable') dataTable!: DataTableAssetsComponent;

  override filterDefs = assetFilters();
  readonly signals = ASSET_SIGNALS;

  constructor(
    protected override service: AssetService,
    private route: ActivatedRoute
  ) {
    super();
  }

  protected override getEntityIdentifier(entity: Asset): string {
    return entity.asset_name ?? '';
  }

  protected override entityLabel(): string {
    return 'Immobile';
  }

  override ngOnInit() {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }
}
