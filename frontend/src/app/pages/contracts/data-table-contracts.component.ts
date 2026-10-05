import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Contract} from './entity/contract.entity';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ContractEditDialogComponent} from './contract-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {partyName} from '../../core/helpers/party-name.helper';

@Component({
  selector: 'app-data-table-contracts',
  standalone: true,
  imports: [ListToolbarComponent, 
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, DatePipe, HasRoleDirective,
    FormsModule, MatFormFieldModule, MatSelectModule
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-contracts.component.html'
})
export class DataTableContractsComponent extends AbstractDataTableComponent<Contract> {
  readonly partyName = partyName;

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '60px'},
    {field: 'cig_contract', header: 'CIG', minWidth: '120px'},
    {field: 'consip_order', header: 'Numero ordine (ODA)', minWidth: '120px'},
    {field: 'consipAgreement', header: 'Convenzione CONSIP', minWidth: '180px'},
    {field: 'supplier', header: 'Fornitore', minWidth: '120px'},
    {field: 'supply_start_date', header: 'Decorrenza', minWidth: '110px'},
    {field: 'supply_expiry_date', header: 'Scadenza', minWidth: '130px'},
    {field: 'management_expiry_date', header: 'Scadenza gestione', minWidth: '130px'},
    {field: 'takeover_termination_date', header: 'Data voltura/cessazione', minWidth: '130px'},
    {field: 'utilities', header: 'Utenze coperte', minWidth: '100px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'cig_contract', 'supplier', 'supply_start_date', 'supply_expiry_date', 'consip_order', 'utilities',
  ]);

  private static readonly STORAGE_KEY = 'columns:contracts';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableContractsComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableContractsComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Contract {
    return Contract.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ContractEditDialogComponent;
  }

  protected override useSheet(): boolean {
    return true;
  }


  protected override entityLabel(): string {
    return 'contratto di fornitura';
  }

  override openDeleteDialog(entity: Contract): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina contratto di fornitura',
        message: `Disattiva il contratto ${entity.cig_contract ?? 'senza CIG specificato'}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Contract): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina contratto di fornitura',
        message: `Riattiva il contratto ${entity.cig_contract ?? 'senza CIG specificato'}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
