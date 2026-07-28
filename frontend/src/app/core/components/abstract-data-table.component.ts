import {Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, ViewChild} from '@angular/core';
import {FormBuilder, FormGroup} from '@angular/forms';
import {Table} from 'primeng/table';
import {ScreenSizeService} from '../../services/screen-size.service';
import {plainToInstance} from 'class-transformer';

@Component({
             template: ''
           })
export abstract class AbstractDataTableComponent<T extends { id: any; name?: string }> implements OnInit, OnChanges {

  protected fb: FormBuilder = inject(FormBuilder);
  form!: FormGroup;

  @Input() data: T[] = [];
  @Input() loading: boolean = false;
  @Input() creationResult?: { success: boolean, message?: string };

  @Output() onSave = new EventEmitter<T>();
  @Output() onDelete = new EventEmitter<T>();
  @Output() onCreate = new EventEmitter<T>();
  @Output() onRestore = new EventEmitter<T>();

  @ViewChild('myTable') pTable: Table | undefined;

  height: number = 0;
  rowHeight: number = 0;
  isNew = false;
  selectedItem: T | null = null;
  editDialogVisible = false;
  deleteDialogVisible = false;
  restoreDialogVisible = false;

  private _resetPagingTrigger: number = 0;

  rowsPerPageOptions: number[] = [10, 20, 50];

  @Input()
  set resetPagingTrigger(value: number) {
    this._resetPagingTrigger = value;
    if (this.pTable && this._resetPagingTrigger > 0) {
      this.pTable.reset();
    }
  }

  protected constructor(protected screen: ScreenSizeService) {
  }

  ngOnInit() {
    this.screen.screenHeight$.subscribe(h => {
      this.height = h;
      this.rowHeight = this.height / 10;
    });
  }

  ngOnChanges() {
    if (this.creationResult?.success) {
      this.editDialogVisible = false;
    }
  }

  restoreItem(entity: T) {
    this.selectedItem = entity;
    this.restoreDialogVisible = true;
  }

  confirmRestore() {
    if (!this.selectedItem) return;
    this.onRestore.emit(this.selectedItem);
    this.restoreDialogVisible = false;
  }

  openDeleteDialog(entity: T) {
    this.selectedItem = entity;
    this.deleteDialogVisible = true;
  }

  confirmDelete() {
    if (!this.selectedItem) return;
    this.onDelete.emit(this.selectedItem);
    this.deleteDialogVisible = false;
  }

  saveItem() {
    if (!this.selectedItem || !this.isFormValid()) return;

    const EntityClass = this.itemInstance().constructor as any;
    this.selectedItem = plainToInstance(EntityClass, {
      id: this.selectedItem.id,
      ...this.prepareFormValue()
    }) as T;
    this.enrichItem();

    if (this.isNew) {
      this.onCreate.emit(this.selectedItem);
      this.editDialogVisible = false;
    } else {
      const index = this.data.findIndex(u => (u as any).id === this.selectedItem!.id);
      if (index !== -1) {
        this.data[index] = {...this.selectedItem} as T;
      }
      this.editDialogVisible = false;
      this.onSave.emit(this.selectedItem);
    }
  }

  protected prepareFormValue(): Record<string, any> {
    return this.form.getRawValue();
  }

  protected enrichItem(): void {
  }

  abstract itemInstance(): T;

  protected buildForm(data?: Partial<T>): void {
  }

  openCreateDialog(): void {
    this.selectedItem = this.itemInstance();
    this.isNew = true;
    this.buildForm(this.selectedItem ?? undefined);
    this.editDialogVisible = true;
  }

  openEditDialog(item: T): void {
    this.selectedItem = {...item} as T;
    this.isNew = false;
    this.buildForm(this.selectedItem ?? undefined);
    this.editDialogVisible = true;
  }

  abstract isFormValid(): boolean;

  // Override in subclass to provide cell values for CSV export.
  protected exportCellValue(_item: T, _field: string): string {
    return '';
  }

  getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key: string) =>
      acc != null ? (acc as Record<string, unknown>)[key] : null, obj);
  }

  exportToCSV(columns: IColumnDef[], filename: string): void {
    const BOM = '\uFEFF';
    const sep = ';';
    const headers = columns.map(c => `"${c.header}"`).join(sep);
    const rows = this.data.map(item =>
      columns.map(c => `"${this.exportCellValue(item, c.field).replace(/"/g, '""')}"`).join(sep)
    );
    const csv = BOM + [headers, ...rows].join('\r\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected loadColumnSelection(storageKey: string, allColumns: IColumnDef[], defaultFields: Set<string>): IColumnDef[] {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const fields: string[] = JSON.parse(raw);
        const selected = fields
          .map(f => allColumns.find(c => c.field === f))
          .filter((c): c is IColumnDef => c != null);
        if (selected.length > 0) return selected;
      }
    } catch {
      // corrupted storage — fall through to default
    }
    return allColumns.filter(c => defaultFields.has(c.field));
  }

  protected saveColumnSelection(storageKey: string, selectedColumns: IColumnDef[]): void {
    localStorage.setItem(storageKey, JSON.stringify(selectedColumns.map(c => c.field)));
  }

  protected resolveOnRelation<D extends object>(relation: keyof D, prop: keyof D, data?: D): any {
    return data?.[relation] != null ? (data[prop] ?? null) : null;
  }
}
