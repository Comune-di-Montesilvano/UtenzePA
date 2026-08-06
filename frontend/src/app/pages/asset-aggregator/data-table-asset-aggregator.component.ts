import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {AssetAggregator} from './entity/asset-aggregator.entity';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {AssetAggregatorEditDialogComponent} from './asset-aggregator-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-aggregators',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  templateUrl: './data-table-asset-aggregator.component.html'
})
export class DataTableAggregatorsComponent extends AbstractDataTableComponent<AssetAggregator> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): AssetAggregator {
    return AssetAggregator.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetAggregatorEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'aggregato immobile';
  }

  override openDeleteDialog(entity: AssetAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina aggregato',
        message: `Sei sicuro di voler eliminare l'anagrafica dell'aggregato immobili ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: AssetAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina aggregato',
        message: `Riattiva aggregato ${entity.description}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
