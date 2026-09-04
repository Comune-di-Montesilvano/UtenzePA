import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {DatePipe} from '@angular/common';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Contract} from './entity/contract.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ContractEditDialogComponent} from './contract-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-contracts',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, DatePipe, HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-contracts.component.html'
})
export class DataTableContractsComponent extends AbstractDataTableComponent<Contract> {

  displayedColumns = ['actions', 'id', 'cig_contract', 'supplier', 'supply_start_date', 'supply_expiry_date', 'order_number', 'utilities'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Contract {
    return Contract.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ContractEditDialogComponent;
  }

  protected override editDialogWidth(): string {
    return '900px';
  }

  protected override entityLabel(): string {
    return 'contratto';
  }

  override openDeleteDialog(entity: Contract): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina contratto',
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
        title: 'Ripristina contratto',
        message: `Riattiva il contratto ${entity.cig_contract ?? 'senza CIG specificato'}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
