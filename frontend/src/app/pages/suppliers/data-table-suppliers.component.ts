import {Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Supplier} from './entity/supplier.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SupplierEditDialogComponent} from './supplier-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-suppliers',
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
  templateUrl: './data-table-suppliers.component.html'
})
export class DataTableSuppliersComponent extends AbstractDataTableComponent<Supplier> {

  displayedColumns = ['actions', 'id', 'supplier_id', 'company_name', 'vat_number', 'tax_code', 'address', 'city', 'postal_code', 'email', 'pec'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Supplier {
    return Supplier.create();
  }

  override editDialogComponent(): Type<unknown> {
    return SupplierEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'fornitore';
  }

  override openDeleteDialog(entity: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina anagrafica',
        message: `Disattiva fornitore ${entity.supplier_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Supplier): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina anagrafica',
        message: `Riattiva fornitore ${entity.supplier_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
