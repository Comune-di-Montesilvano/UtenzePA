import {Component, Type} from '@angular/core';
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
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConsipAgreementEditDialogComponent} from './consip-agreement-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {BooleanYesNoPipe} from '../../core/pipes/boolean-yes-no-pipe';

@Component({
  selector: 'app-data-table-consip-agreement',
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
    HasRoleDirective,
    BooleanYesNoPipe
  ],
  templateUrl: './data-table-consip-agreement.component.html'
})
export class DataTableConsipAgreementComponent extends AbstractDataTableComponent<ConsipAgreement> {

  displayedColumns = ['actions', 'id', 'name', 'supplier', 'cig_master', 'expiration_date', 'safeguard'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): ConsipAgreement {
    return ConsipAgreement.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ConsipAgreementEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'convenzione CONSIP';
  }

  override openDeleteDialog(entity: ConsipAgreement): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina convenzione',
        message: `Eliminare convenzione ${entity.name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: ConsipAgreement): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina convenzione',
        message: `Riattiva convenzione ${entity.name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
