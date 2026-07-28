import {Component, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {Asset} from './entity/asset.entity';
import {AssetService} from './asset.service';
import {DataTableAssetsComponent} from './data-table-assets.component';
import {SearchAssetsComponent} from './search-assets.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {ActivatedRoute} from '@angular/router';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
             selector: 'app-assets',
             standalone: true,
             providers: [MessageService],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               DataTableAssetsComponent,
               ToastModule,
               SearchAssetsComponent
             ],
             templateUrl: './assets.component.html'
           })
export class AssetsComponent extends AbstractComponent<Asset> {

  @ViewChild('dataTable') dataTable!: DataTableAssetsComponent;

  creationResult?: { success: boolean; message?: string };

  private selectedId?: number | null;

  constructor(
    protected override service: AssetService,
    private route: ActivatedRoute
  ) {
    super();
  }

  get assets(): Asset[] {
    return this.list;
  }

  protected override getEntityIdentifier(entity: Asset): string {
    return entity.asset_name ?? '';
  }

  override ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.loadAll();
    });
  }

  override loadAll() {
    this.loading = true;
    this.service.search({}).subscribe((result: Asset[]) => {
      this.list = result;
      this.allItems = [...result];

      if (this.selectedId) {
        const asset = result.find(a => a.id === this.selectedId);
        if (asset) setTimeout(() => this.dataTable?.openEditDialog(asset));
      }
      this.loading = false;
    });
  }

  override onCreate(entity: Asset) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe(
      {
        next: (item: Asset) => {
          this.list.push(item);
          this.loadAll();
          this.messageService.add({
                                    severity: 'success',
                                    summary: 'Immobile creato',
                                    detail: item.asset_name,
                                    key: 'global'
                                  });
          this.creationResult = {
            success: true,
            message: 'Immobile creato con successo'
          };
        },
        error: (err: any) => {
          this.handleError(err, 'Errore generico nella creazione Asset');
          this.creationResult = {success: false};
        }
      });
  }
}
