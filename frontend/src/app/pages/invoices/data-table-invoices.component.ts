import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Invoice} from './entity/invoice.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {InvoiceEditDialogComponent} from './invoice-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {ExportHelper} from '../../core/helpers/export.helper';

@Component({
  selector: 'app-data-table-invoices',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    DatePipe, HasRoleDirective, FormatAmountPipe, TruncatePipe
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-invoices.component.html'
})
export class DataTableInvoicesComponent extends AbstractDataTableComponent<Invoice> {

  readonly allColumns: IColumnDef[] = [
    {field: 'invoice_id', header: 'ID Fattura', minWidth: '120px'},
    {field: 'protocol_number', header: 'N. Protocollo', minWidth: '120px'},
    {field: 'invoice_date', header: 'Data Fattura', minWidth: '120px'},
    {field: 'net_amount_excl_vat', header: 'Importo Netto', minWidth: '120px'},
    {field: 'last_invoice_arrears', header: 'Morosità', minWidth: '120px'},
    {field: 'contratto.cig_contract', header: 'Contratto (CIG)', minWidth: '200px'},
    {field: 'contratto.supplier.supplier_id', header: 'Fornitore', minWidth: '150px'},
    {field: 'budget_chapters', header: 'Capitoli Associati', minWidth: '180px'},
    {field: 'is_paid', header: 'Stato Pagamento', minWidth: '120px'},
    {field: 'notes_on_invoices', header: 'Note', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'invoice_id', 'protocol_number', 'invoice_date', 'net_amount_excl_vat',
    'last_invoice_arrears', 'contratto.cig_contract', 'contratto.supplier.supplier_id',
    'budget_chapters', 'is_paid',
  ]);

  private static readonly STORAGE_KEY = 'columns:invoices';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableInvoicesComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  maxDescLength = 50;

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableInvoicesComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
    // Custom sort fedele all'originale PrimeNG customSort(event): path annidati
    // (es. "utility.utility_id") + confronto stringhe con localeCompare('it') + fallback
    // numerico. MatTableDataSource.sortingDataAccessor restituisce un solo valore comparabile
    // per colonna e usa un ordinamento lessicografico non locale-aware: per riprodurre
    // fedelmente il comparator originale (che riceveva sia v1 sia v2) è necessario sovrascrivere
    // sortData, l'unico hook di MatTableDataSource che riceve l'intero array e può applicare un
    // Array.prototype.sort con comparator a due argomenti.
    this.dataSource.sortData = (data: Invoice[], sort: MatSort): Invoice[] => {
      const active = sort.active;
      const direction = sort.direction;
      if (!active || direction === '') return data;
      const order = direction === 'asc' ? 1 : -1;
      const getVal = (obj: any, path: string): any =>
        path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
      return [...data].sort((a, b) => {
        const v1 = getVal(a, active);
        const v2 = getVal(b, active);
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return order;
        if (v2 == null) return -order;
        if (typeof v1 === 'string' && typeof v2 === 'string') {
          return order * v1.localeCompare(v2, 'it');
        }
        const n1 = Number(v1), n2 = Number(v2);
        if (!isNaN(n1) && !isNaN(n2)) return order * (n1 - n2);
        return order * String(v1).localeCompare(String(v2), 'it');
      });
    };
  }

  protected override exportCellValue(item: Invoice, field: string): string {
    switch (field) {
      case 'invoice_date':
        return ExportHelper.formatDate(item.invoice_date);
      case 'net_amount_excl_vat':
        return item.net_amount_excl_vat != null
          ? item.net_amount_excl_vat.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'last_invoice_arrears':
        return item.last_invoice_arrears != null
          ? item.last_invoice_arrears.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'budget_chapters':
        return item.budget_chapters?.map(bc => bc.label).join(', ') ?? '';
      case 'is_paid':
        return ExportHelper.boolData(item.is_paid);
      default:
        return String(this.getNestedValue(item, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'fatture');
  }

  override itemInstance(): Invoice {
    return Invoice.create();
  }

  override editDialogComponent(): Type<unknown> {
    return InvoiceEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Fattura';
  }

  override openDeleteDialog(entity: Invoice): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Fattura',
        message: `Sei sicuro di voler eliminare la Fattura ${entity.invoice_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Invoice): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Fattura',
        message: `Riattiva Fattura ${entity.invoice_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
