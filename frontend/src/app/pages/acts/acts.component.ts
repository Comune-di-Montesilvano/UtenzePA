import {AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {MatDialog} from '@angular/material/dialog';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule, PageEvent} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HttpErrorResponse} from '@angular/common/http';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {openSheet} from '../../core/components/entity-sheet/sheet-utils';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import type {FilterValues} from '../../core/components/list/filter-def';
import {fromQueryParams, toSearchParams} from '../../core/components/list/filter-values';
import {ToastService} from '../../core/services/toast.service';
import {ActFilters, ActService} from './act.service';
import {Act} from './act.model';
import {ActEditDialogComponent, ActEditDialogData} from './act-edit-dialog.component';
import {actFilters} from './acts-filters';

// Colonne visibili ricordate (tutte, se nessuna scelta salvata).
const COLUMNS_KEY = 'columns:acts';
const readColumns = (all: IColumnDef[]): IColumnDef[] => {
  try {
    const fields: string[] = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? '[]');
    const cols = all.filter(c => fields.includes(c.field));
    return cols.length ? cols : all;
  } catch {
    return all;
  }
};

// Righe per pagina ricordate, come negli altri elenchi.
const PAGE_SIZE_KEY = 'list-page-size:Atti';
const readPageSize = (): number => {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return [25, 50, 100].includes(n) ? n : 25;
  } catch {
    return 25;
  }
};

const dateIt = (iso: string | null): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

// Atti ufficiali (delibere, determine, atti notarili…), con o senza il testo.
// Filtri lato server, ricerca libera lato client.
@Component({
  selector: 'app-acts',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule, MatTooltipModule,
    MatProgressBarModule, HasRoleDirective, ListFiltersComponent, ListToolbarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <h1>Atti</h1>
      <p class="list-subtitle">Delibere, determine, decreti, atti notarili e altri atti ufficiali, con o senza il testo.</p>
      <app-list-filters [defs]="filterDefs" [values]="filterValues" placeholder="Cerca numero, oggetto, emesso da..."
                        (valuesChange)="onFilters($event)" (quickSearch)="query = $event; applyFilter()"></app-list-filters>

      <div style="margin-top: 1rem;">
        <app-list-toolbar [count]="dataSource.filteredData.length" createLabel="Nuovo atto"
                          [columns]="allColumns" [selectedColumns]="selectedColumns"
                          (selectedColumnsChange)="onColumnsChange($event)"
                          [exportable]="true" (export)="exportCsv()" (create)="openDialog()"></app-list-toolbar>
      </div>

      @if (loading) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      <div style="margin-top: 0.75rem; overflow-x: auto;">
        <table mat-table [dataSource]="dataSource" matSort style="width: 100%; min-width: 900px;">
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef style="width: 110px;">Azioni</th>
            <td mat-cell *matCellDef="let item" style="white-space: nowrap;">
              @if (!item.deleted) {
                <button mat-icon-button (click)="openDialog(item)" matTooltip="Dettaglio atto"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button (click)="remove(item)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina"><mat-icon>delete</mat-icon></button>
              } @else {
                <button mat-icon-button (click)="restore(item)" [appHasRole]="['Admin','Operatore']" matTooltip="Ripristina"><mat-icon>restore_from_trash</mat-icon></button>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
            <td mat-cell *matCellDef="let item">{{ item.actType?.name }}</td>
          </ng-container>
          <ng-container matColumnDef="number">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Numero</th>
            <td mat-cell *matCellDef="let item">{{ item.number }}</td>
          </ng-container>
          <ng-container matColumnDef="act_date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Data</th>
            <td mat-cell *matCellDef="let item">{{ date(item.act_date) }}</td>
          </ng-container>
          <ng-container matColumnDef="subject">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Oggetto</th>
            <td mat-cell *matCellDef="let item">{{ item.subject }}</td>
          </ng-container>
          <ng-container matColumnDef="issuer">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Emesso da</th>
            <td mat-cell *matCellDef="let item">{{ item.issuer }}</td>
          </ng-container>
          <ng-container matColumnDef="file_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>File</th>
            <td mat-cell *matCellDef="let item">{{ item.file_count }}</td>
          </ng-container>
          <ng-container matColumnDef="link_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Collegamenti</th>
            <td mat-cell *matCellDef="let item">{{ item.link_count }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: columns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell" [attr.colspan]="columns.length" style="padding: 1rem; color: var(--app-muted);">Nessun atto trovato.</td>
          </tr>
        </table>
      </div>
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" [pageSize]="pageSize" showFirstLastButtons (page)="onPage($event)"></mat-paginator>
    </div>
  `,
})
export class ActsComponent implements OnInit, AfterViewInit {
  private service = inject(ActService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly allColumns: IColumnDef[] = [
    {field: 'type', header: 'Tipo'}, {field: 'number', header: 'Numero'}, {field: 'act_date', header: 'Data'},
    {field: 'subject', header: 'Oggetto'}, {field: 'issuer', header: 'Emesso da'},
    {field: 'file_count', header: 'File'}, {field: 'link_count', header: 'Collegamenti'},
  ];
  selectedColumns: IColumnDef[] = readColumns(this.allColumns);

  get columns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  dataSource = new MatTableDataSource<Act>([]);
  loading = false;
  query = '';
  readonly filterDefs = actFilters(() => this.service.types());
  filterValues: FilterValues = {};
  pageSize = readPageSize();
  readonly date = dateIt;

  ngOnInit(): void {
    this.dataSource.sortingDataAccessor = (a, column) => {
      switch (column) {
        case 'type': return (a.actType?.name ?? '').toLowerCase();
        case 'number': return (a.number ?? '').toLowerCase();
        case 'act_date': return a.act_date ?? '';
        case 'issuer': return (a.issuer ?? '').toLowerCase();
        case 'file_count': return a.file_count;
        case 'link_count': return a.link_count;
        default: return (a.subject ?? '').toLowerCase();
      }
    };
    this.dataSource.filterPredicate = (a, q) => {
      if (!q) return true;
      return [a.actType?.name, a.number, a.subject, a.issuer, a.protocol_number, a.notes]
        .join(' ').toLowerCase().includes(q);
    };
    this.filterValues = fromQueryParams(this.filterDefs, this.route.snapshot.queryParams);
    this.reload();
    const selectedId = Number(this.route.snapshot.queryParamMap.get('selectedId'));
    if (selectedId) this.openDialog(undefined, selectedId);
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  onColumnsChange(cols: IColumnDef[]): void {
    this.selectedColumns = cols;
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols.map(c => c.field)));
    } catch {
      // storage non disponibile: vale solo per questa sessione
    }
  }

  applyFilter(): void {
    this.dataSource.filter = this.query.trim().toLowerCase();
    this.paginator?.firstPage();
  }

  openDialog(item?: Act, actId?: number): void {
    openSheet<ActEditDialogComponent, ActEditDialogData, Act | null>(this.dialog, ActEditDialogComponent, {
      actId: item?.id ?? actId ?? null,
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(a: Act): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina atto', message: `Eliminare l'atto "${a.subject}"?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(a.id).subscribe({
        next: () => this.reload(),
        error: (err: HttpErrorResponse) => this.fail('Eliminazione non riuscita', err),
      });
    });
  }

  restore(a: Act): void {
    this.service.restore(a.id).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => this.fail('Ripristino non riuscito', err),
    });
  }

  private fail(summary: string, err: HttpErrorResponse): void {
    this.toast.add({severity: 'error', summary, detail: err.error?.message ?? 'Errore imprevisto.'});
  }

  exportCsv(): void {
    const header = ['Tipo', 'Numero', 'Data', 'Oggetto', 'Emesso da', 'Protocollo', 'File', 'Collegamenti', 'Note'];
    const rows = this.dataSource.filteredData.map(a => [
      a.actType?.name ?? '', a.number ?? '', dateIt(a.act_date), a.subject, a.issuer ?? '',
      a.protocol_number ?? '', a.file_count, a.link_count, a.notes ?? '',
    ]);
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `atti_${new Date().toLocaleDateString('sv-SE')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  onFilters(values: FilterValues): void {
    this.filterValues = values;
    this.reload();
  }

  onPage(e: PageEvent): void {
    if (e.pageSize === this.pageSize) return;
    this.pageSize = e.pageSize;
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(e.pageSize));
    } catch {
      // storage non disponibile: vale solo per questa sessione
    }
  }

  reload(): void {
    this.loading = true;
    this.service.list(toSearchParams(this.filterDefs, this.filterValues) as ActFilters).subscribe({
      next: rows => {
        this.dataSource.data = rows;
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento atti:', err);
      },
    });
  }
}
