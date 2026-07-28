import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {MultiSelectModule} from 'primeng/multiselect';
import {Invoice} from './entity/invoice.entity';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {UtilityService} from '../utilities/utility.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {SkeletonModule} from 'primeng/skeleton';
import {Textarea} from 'primeng/textarea';
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {Utility} from '../utilities/entity/utility.entity';
import {ExportHelper} from '../../core/helpers/export.helper';

@Component({
             selector: 'app-data-table-invoices',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               FormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               MultiSelectModule,
               HasRoleDirective,
               InputTextModule,
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               TooltipModule,
               ReadOnlyDirective,
               Textarea,
               FormatAmountPipe,
               TruncatePipe,
               SkeletonModule,
             ],
             templateUrl: './data-table-invoices.component.html'
           })
export class DataTableInvoicesComponent extends AbstractDataTableComponent<Invoice> implements OnInit {

  utilityOptions: Utility[] = [];
  supplierOptions: Supplier[] = [];
  budgetChapterOptions: BudgetChapter[] = [];

  readonly allColumns: IColumnDef[] = [
    {field: 'invoice_id', header: 'ID Fattura', minWidth: '120px'},
    {field: 'protocol_number', header: 'N. Protocollo', minWidth: '120px'},
    {field: 'invoice_date', header: 'Data Fattura', minWidth: '120px'},
    {field: 'net_amount_excl_vat', header: 'Importo Netto', minWidth: '120px'},
    {field: 'last_invoice_arrears', header: 'Morosità', minWidth: '120px'},
    {field: 'utility.utility_id', header: 'Utenza (POD/PDR)', minWidth: '200px'},
    {field: 'supplier.supplier_id', header: 'Fornitore', minWidth: '150px'},
    {field: 'budget_chapters', header: 'Capitoli Associati', minWidth: '180px'},
    {field: 'is_paid', header: 'Stato Pagamento', minWidth: '120px'},
    {field: 'notes_on_invoices', header: 'Note', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'invoice_id', 'protocol_number', 'invoice_date', 'net_amount_excl_vat',
    'last_invoice_arrears', 'utility.utility_id', 'supplier.supplier_id',
    'budget_chapters', 'is_paid',
  ]);

  private static readonly STORAGE_KEY = 'columns:invoices';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableInvoicesComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableInvoicesComponent.STORAGE_KEY, this.selectedColumns);
  }

  readonly skeletonRows = Array(10).fill({});
  get skeletonCols(): number[] {
    return Array.from({length: this.selectedColumns.length + 1}, (_, i) => i);
  }

  constructor(
    screen: ScreenSizeService,
    private utilitiesService: UtilityService,
    private suppliersService: SuppliersService,
    private budgetChapterService: BudgetChaptersService
  ) {
    super(screen);
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.loadDependencies();
  }

  loadDependencies() {
    this.utilitiesService.search().subscribe({
      next: (data: any[]) => {
        this.utilityOptions = data.sort((a, b) => (a.utility_id ?? '').localeCompare(b.utility_id ?? ''));
      },
      error: (err) => console.error('Errore nel caricamento delle Utenze:', err)
    });

    this.suppliersService.search({deleted: false}).subscribe({
      next: (data) => {
        this.supplierOptions = data.sort((a, b) => (a.supplier_id ?? '').localeCompare(b.supplier_id ?? ''));
      },
      error: (err) => console.error('Errore nel caricamento dei fornitori:', err)
    });

    this.budgetChapterService.search({deleted: false}).subscribe({
      next: (data: any[]) => {
        this.budgetChapterOptions = data.sort((a, b) => (a.budget_chapter_id ?? '').localeCompare(b.budget_chapter_id ?? ''));
      },
      error: (err) => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
  }

  customSort(event: any) {
    const getVal = (obj: any, path: string): any =>
      path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);

    event.data.sort((a: any, b: any) => {
      const v1 = getVal(a, event.field);
      const v2 = getVal(b, event.field);
      if (v1 == null && v2 == null) return 0;
      if (v1 == null) return event.order;
      if (v2 == null) return -event.order;
      if (typeof v1 === 'string' && typeof v2 === 'string') {
        return event.order * v1.localeCompare(v2, 'it');
      }
      const n1 = Number(v1), n2 = Number(v2);
      if (!isNaN(n1) && !isNaN(n2)) return event.order * (n1 - n2);
      return event.order * String(v1).localeCompare(String(v2), 'it');
    });
  }

  protected override exportCellValue(item: Invoice, field: string): string {
    const inv = item as any;
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
        return ExportHelper.boolData(inv.is_paid);
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

  protected override buildForm(data?: Partial<Invoice>): void {
    this.form = this.fb.group({
      invoice_id: [data?.invoice_id ?? '', Validators.required],
      protocol_number: [data?.protocol_number ?? '', Validators.required],
      invoice_date: [data?.invoice_date ? new Date(data.invoice_date) : null, Validators.required],
      net_amount_excl_vat: [data?.net_amount_excl_vat != null ? Number(data.net_amount_excl_vat) : null, Validators.required],
      last_invoice_arrears: [data?.last_invoice_arrears != null ? Number(data.last_invoice_arrears) : 0],
      utility_id_fk: [data?.utility_id_fk ?? null, Validators.required],
      supplier_id_fk: [this.resolveOnRelation('supplier', 'supplier_id_fk', data) ?? null],
      notes_on_invoices: [data?.notes_on_invoices ?? ''],
      budget_chapter_ids: [(data?.budget_chapters ?? []).map(bc => bc.id)],
    });
  }

  override openCreateDialog() {
    super.openCreateDialog();
  }

  override openEditDialog(invoice: Invoice) {
    super.openEditDialog(invoice);
  }

  protected override prepareFormValue(): Record<string, any> {
    const {budget_chapter_ids, ...rest} = this.form.value;
    return rest;
  }

  protected override enrichItem(): void {
    const {budget_chapter_ids} = this.form.value;
    this.selectedItem!.budget_chapters = (budget_chapter_ids ?? []).map((id: number) =>
      this.budgetChapterOptions.find(p => p.id === id) as BudgetChapter
    );
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}
