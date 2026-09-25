import {Component, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Asset} from './entity/asset.entity';
import {AssetService} from './asset.service';
import {DataTableAssetsComponent} from './data-table-assets.component';
import {SearchAssetsComponent} from './search-assets.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [DataTableAssetsComponent, SearchAssetsComponent, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './assets.component.html'
})
export class AssetsComponent extends AbstractComponent<Asset> {

  @ViewChild('dataTable') dataTable!: DataTableAssetsComponent;

  private selectedId?: number | null;

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
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.loadAll();
    });
  }

  override loadAll() {
    this.loading = true;
    this.service.search(this.lastFilters).subscribe((result: Asset[]) => {
      this.list = this.service.fromPlain(result);
      this.allItems = [...this.list];

      if (this.selectedId) {
        const asset = this.list.find(a => a.id === this.selectedId);
        if (asset) setTimeout(() => this.dataTable?.openEditDialog(asset));
      }
      this.loading = false;
    });
    this.service.legacyCount().subscribe({
      next: n => this.legacyCount = n,
      error: () => this.legacyCount = 0
    });
  }

  showLegacyOnly(): void {
    this.onSearch({legacy_only: true});
  }
}
