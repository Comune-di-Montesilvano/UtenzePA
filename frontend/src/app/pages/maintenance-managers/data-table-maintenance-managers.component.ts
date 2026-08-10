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
import {MaintenanceManager} from './entity/maintenance-manager.entity';
import {MaintenanceManagerEditDialogComponent} from './maintenance-manager-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-maintenance-managers',
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
  templateUrl: './data-table-maintenance-managers.component.html'
})
export class DataTableMaintenanceManagersComponent extends AbstractDataTableComponent<MaintenanceManager> {

  displayedColumns = ['actions', 'id', 'code', 'description'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): MaintenanceManager {
    return MaintenanceManager.create();
  }

  override editDialogComponent(): Type<unknown> {
    return MaintenanceManagerEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'gestore manutenzione';
  }

  override openDeleteDialog(entity: MaintenanceManager): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Gestore',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: MaintenanceManager): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Gestore',
        message: `Riattiva Gestore ${entity.code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
