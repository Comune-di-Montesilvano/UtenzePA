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
import {UtilityType} from './entity/utility-type.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilityTypeEditDialogComponent} from './utility-type-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {HardType, HardTypeDescription} from './enum/hard-type.enum';

@Component({
  selector: 'app-data-table-utility-types',
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
  templateUrl: './data-table-utility-types.component.html'
})
export class DataTableUtilityTypesComponent extends AbstractDataTableComponent<UtilityType> {

  displayedColumns = ['actions', 'id', 'name', 'hard_type', 'description'];
  hardTypeDescription = HardTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilityType {
    return UtilityType.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityTypeEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'tipologia uso contatore';
  }

  getHardTypeDescription(value: any): string {
    return this.hardTypeDescription[value as HardType] || value;
  }

  override openDeleteDialog(entity: UtilityType): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina tipologia',
        message: `Elimina tipologia ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilityType): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina tipologia',
        message: `Riattiva tipologia ${entity.name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
