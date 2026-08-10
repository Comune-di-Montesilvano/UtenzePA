import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
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
import {UtilityAggregator} from './entity/utility-aggregator.entity';
import {UtilityAggregatorEditDialogComponent} from './utility-aggregator-edit-dialog.component';

@Component({
  selector: 'app-data-table-utility-aggregators',
  standalone: true,
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-utility-aggregator.component.html'
})
export class DataTableUtilityAggregatorsComponent extends AbstractDataTableComponent<UtilityAggregator> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilityAggregator {
    return UtilityAggregator.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityAggregatorEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'aggregato utenza';
  }

  override openDeleteDialog(entity: UtilityAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Aggregato Utenza',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilityAggregator): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Aggregato Utenza',
        message: `Riattiva Aggregato Utenza ${entity.code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
