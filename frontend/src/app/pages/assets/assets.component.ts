import {Component, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Asset} from './entity/asset.entity';
import {AssetService} from './asset.service';
import {DataTableAssetsComponent} from './data-table-assets.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {assetFilters} from './assets-filters';
import {AbstractComponent} from '../../core/components/abstract.component';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DataTableAssetsComponent, ListFiltersComponent, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './assets.component.html'
})
export class AssetsComponent extends AbstractComponent<Asset> {

  @ViewChild('dataTable') dataTable!: DataTableAssetsComponent;

  override filterDefs = assetFilters();

  legacyCount = 0;

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

  override loadAll(after?: (list: Asset[]) => void) {
    super.loadAll(after);
    this.service.legacyCount().subscribe({
      next: n => this.legacyCount = n,
      error: () => this.legacyCount = 0
    });
  }

  showLegacyOnly(): void {
    this.onFiltersChange({...this.filterValues, legacy_only: true});
  }
}
