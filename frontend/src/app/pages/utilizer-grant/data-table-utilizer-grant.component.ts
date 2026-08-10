import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilizerGrantEditDialogComponent} from './utilizer-grant-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {StringHelper} from '../../core/helpers/string.helper';

@Component({
  selector: 'app-data-table-utilizer-grant',
  standalone: true,
  imports: [
    DatePipe,
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
  templateUrl: './data-table-utilizer-grant.component.html'
})
export class DataTableUtilizerGrantComponent extends AbstractDataTableComponent<UtilizerGrant> {

  displayedColumns = [
    'actions', 'id', 'asset', 'utilizer', 'usage_type',
    'grant_date', 'expire_date', 'concession_act', 'utilities_to_be_taken_over'
  ];

  readonly maxDescLength = 50;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): UtilizerGrant {
    return UtilizerGrant.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilizerGrantEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'concessione';
  }

  truncate(value: string | null | undefined): string {
    return StringHelper.truncateAt(value, this.maxDescLength);
  }

  override openDeleteDialog(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Concessione',
        message: `Sei sicuro di voler eliminare la Concessione ${entity.id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Concessione',
        message: `Riattiva Concessione ${entity.id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
