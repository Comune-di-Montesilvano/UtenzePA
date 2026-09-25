import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {AssetNature} from './entity/asset-nature.entity';
import {AssetNatureEditDialogComponent} from './asset-nature-edit-dialog.component';

@Component({
  selector: 'app-data-table-asset-nature',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-asset-nature.component.html'
})
export class DataTableAssetNatureComponent extends AbstractDataTableComponent<AssetNature> {
  displayedColumns = ['actions', 'id', 'icon', 'name', 'functions'];
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  functionNames(item: AssetNature): string {
    return (item.functions ?? []).map(f => f.name).join(', ');
  }

  override itemInstance(): AssetNature {
    return AssetNature.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetNatureEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'natura immobile';
  }

  override openDeleteDialog(entity: AssetNature): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina natura',
        message: `Eliminare la natura immobile ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: AssetNature): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Ripristina natura', message: `Riattiva la natura ${entity.name}?`, confirmLabel: 'Ripristina'}
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
