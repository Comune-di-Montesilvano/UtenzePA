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
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConsipAgreementEditDialogComponent} from './consip-agreement-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {BooleanYesNoPipe} from '../../core/pipes/boolean-yes-no-pipe';
import {partyName} from '../../core/helpers/party-name.helper';

@Component({
  selector: 'app-data-table-consip-agreement',
  standalone: true,
  imports: [ListToolbarComponent, 
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
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-consip-agreement.component.html'
})
export class DataTableConsipAgreementComponent extends AbstractDataTableComponent<ConsipAgreement> {
  readonly partyName = partyName;

  private static readonly STORAGE_KEY = 'columns:consip-agreement';

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID'},
    {field: 'name', header: 'Nome'},
    {field: 'supplier', header: 'Fornitore'},
    {field: 'cig_master', header: 'CIG Master'},
    {field: 'expiration_date', header: 'Scadenza'},
    {field: 'safeguard', header: 'Salvaguardia'},
  ];

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableConsipAgreementComponent.STORAGE_KEY, this.allColumns, new Set(['id', 'name', 'supplier', 'cig_master', 'expiration_date', 'safeguard'])
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableConsipAgreementComponent.STORAGE_KEY, this.selectedColumns);
  }

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
