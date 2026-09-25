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
import {AssetFunction} from './entity/asset-function.entity';
import {AssetFunctionEditDialogComponent} from './asset-function-edit-dialog.component';

@Component({
  selector: 'app-data-table-asset-function',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-asset-function.component.html'
})
export class DataTableAssetFunctionComponent extends AbstractDataTableComponent<AssetFunction> {
  displayedColumns = ['actions', 'id', 'icon', 'name'];
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): AssetFunction {
    return AssetFunction.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetFunctionEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'funzione immobile';
  }

  override openDeleteDialog(entity: AssetFunction): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina funzione',
        message: `Eliminare la funzione immobile ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: AssetFunction): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Ripristina funzione', message: `Riattiva la funzione ${entity.name}?`, confirmLabel: 'Ripristina'}
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
