import {AfterViewInit, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, Type, ViewChild} from '@angular/core';
import {MatTableDataSource} from '@angular/material/table';
import {MatSort} from '@angular/material/sort';
import {MatPaginator} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog.component';
import {ScreenSizeService} from '../../services/screen-size.service';

export interface EditDialogData<T> {
  mode: 'create' | 'edit';
  item: T;
}

@Component({
  template: ''
})
export abstract class AbstractDataTableComponent<T extends { id: any; name?: string }> implements OnInit, OnChanges, AfterViewInit {

  @Input() data: T[] = [];
  @Input() loading: boolean = false;

  @Output() onSave = new EventEmitter<T>();
  @Output() onDelete = new EventEmitter<T>();
  @Output() onCreate = new EventEmitter<T>();
  @Output() onRestore = new EventEmitter<T>();

  @ViewChild(MatSort) sort?: MatSort;
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  protected dialog = inject(MatDialog);
  dataSource = new MatTableDataSource<T>([]);

  height: number = 0;
  rowHeight: number = 0;

  private _resetPagingTrigger: number = 0;

  rowsPerPageOptions: number[] = [10, 20, 50];

  @Input()
  set resetPagingTrigger(value: number) {
    this._resetPagingTrigger = value;
    if (this.paginator && this._resetPagingTrigger > 0) {
      this.paginator.firstPage();
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
    this.dataSource.data = this.data;
  }

  ngAfterViewInit() {
    if (this.sort) this.dataSource.sort = this.sort;
    if (this.paginator) this.dataSource.paginator = this.paginator;
  }

  restoreItem(entity: T): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: `Ripristina ${this.entityLabel()}`,
        message: `Riattiva ${this.entityLabel()} ${entity.name ?? ''}?`,
        confirmLabel: 'Riattiva'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }

  openDeleteDialog(entity: T): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: `Elimina ${this.entityLabel()}`,
        message: `Elimina ${this.entityLabel()} ${entity.name ?? ''}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  openCreateDialog(): void {
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), {
      width: '600px',
      data: {mode: 'create', item: this.itemInstance()}
    }).afterClosed().subscribe(result => {
      if (result) this.onCreate.emit(result);
    });
  }

  openEditDialog(item: T): void {
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), {
      width: '600px',
      data: {mode: 'edit', item: {...item}}
    }).afterClosed().subscribe(result => {
      if (result) this.onSave.emit(result);
    });
  }

  abstract itemInstance(): T;

  abstract editDialogComponent(): Type<unknown>;

  /** Etichetta minuscola dell'entità usata nei messaggi dei dialog generici (es. "finalità d'uso"). */
  protected abstract entityLabel(): string;

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
