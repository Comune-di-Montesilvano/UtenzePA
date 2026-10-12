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
import {ComplexFilters, ComplexService} from './complex.service';
import {Complex, COMPLEX_TYPE_LABEL} from './complex.model';
import {ComplexEditDialogComponent, ComplexEditDialogData} from './complex-edit-dialog.component';
import {complexFilters} from './complexes-filters';

// Colonne visibili ricordate (tutte, se nessuna scelta salvata).
const COLUMNS_KEY = 'columns:complexes';
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
const PAGE_SIZE_KEY = 'list-page-size:Complessi';
const readPageSize = (): number => {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return [25, 50, 100].includes(n) ? n : 25;
  } catch {
    return 25;
  }
};

// Complessi: immobili gestiti o censiti come un insieme. Filtro tipo lato
// server, ricerca libera lato client.
@Component({
  selector: 'app-complexes',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule, MatTooltipModule,
    MatProgressBarModule, HasRoleDirective, ListFiltersComponent, ListToolbarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <h1>Complessi</h1>
      <p class="list-subtitle">Immobili gestiti o censiti come un insieme: palazzine, plessi scolastici, impianti sportivi.</p>
      <app-list-filters [defs]="filterDefs" [values]="filterValues" placeholder="Cerca nome, indirizzo..."
                        (valuesChange)="onFilters($event)" (quickSearch)="query = $event; applyFilter()"></app-list-filters>

      <div style="margin-top: 1rem;">
        <app-list-toolbar [count]="dataSource.filteredData.length" createLabel="Nuovo complesso"
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
              <button mat-icon-button (click)="openDialog(item)" matTooltip="Dettaglio complesso"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button (click)="remove(item)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
            <td mat-cell *matCellDef="let item">{{ typeText(item) }}</td>
          </ng-container>
          <ng-container matColumnDef="address">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Indirizzo</th>
            <td mat-cell *matCellDef="let item">{{ addressText(item) }}</td>
          </ng-container>
          <ng-container matColumnDef="asset_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Immobili</th>
            <td mat-cell *matCellDef="let item">{{ item.asset_count }}</td>
          </ng-container>
          <ng-container matColumnDef="utility_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Utenze</th>
            <td mat-cell *matCellDef="let item">{{ item.utility_count }}</td>
          </ng-container>
          <ng-container matColumnDef="active_grant_count">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Contratti attivi</th>
            <td mat-cell *matCellDef="let item">{{ item.active_grant_count }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: columns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell" [attr.colspan]="columns.length" style="padding: 1rem; color: var(--app-muted);">Nessun complesso trovato.</td>
          </tr>
        </table>
      </div>
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" [pageSize]="pageSize" showFirstLastButtons (page)="onPage($event)"></mat-paginator>
    </div>
  `,
})
export class ComplexesComponent implements OnInit, AfterViewInit {
  private service = inject(ComplexService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly allColumns: IColumnDef[] = [
    {field: 'name', header: 'Nome'}, {field: 'type', header: 'Tipo'}, {field: 'address', header: 'Indirizzo'},
    {field: 'asset_count', header: 'Immobili'}, {field: 'utility_count', header: 'Utenze'},
    {field: 'active_grant_count', header: 'Contratti attivi'},
  ];
  selectedColumns: IColumnDef[] = readColumns(this.allColumns);

  get columns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  dataSource = new MatTableDataSource<Complex>([]);
  loading = false;
  query = '';
  readonly filterDefs = complexFilters();
  filterValues: FilterValues = {};
  pageSize = readPageSize();

  ngOnInit(): void {
    this.dataSource.sortingDataAccessor = (c, column) => {
      switch (column) {
        case 'type': return this.typeText(c);
        case 'address': return this.addressText(c).toLowerCase();
        case 'asset_count': return c.asset_count;
        case 'utility_count': return c.utility_count;
        case 'active_grant_count': return c.active_grant_count;
        default: return (c.name ?? '').toLowerCase();
      }
    };
    this.dataSource.filterPredicate = (c, q) => {
      if (!q) return true;
      return [c.name, c.address, c.toponym, c.notes].join(' ').toLowerCase().includes(q);
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

  typeText(c: Complex): string {
    return c.complex_type ? COMPLEX_TYPE_LABEL[c.complex_type] : '';
  }

  addressText(c: Complex): string {
    return [c.toponym, c.address, c.civic_number].filter(Boolean).join(' ');
  }

  applyFilter(): void {
    this.dataSource.filter = this.query.trim().toLowerCase();
    this.paginator?.firstPage();
  }

  openDialog(item?: Complex, complexId?: number): void {
    openSheet<ComplexEditDialogComponent, ComplexEditDialogData, Complex | null>(this.dialog, ComplexEditDialogComponent, {
      complexId: item?.id ?? complexId ?? null,
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(c: Complex): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina complesso', message: `Eliminare il complesso "${c.name}"?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(c.id).subscribe({
        next: () => this.reload(),
        error: (err: HttpErrorResponse) => this.toast.add({
          severity: 'error', summary: 'Eliminazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.',
        }),
      });
    });
  }

  exportCsv(): void {
    const header = ['Nome', 'Tipo', 'Indirizzo', 'Immobili', 'Utenze', 'Impianti', 'Contratti attivi', 'Note'];
    const rows = this.dataSource.filteredData.map(c => [
      c.name, this.typeText(c), this.addressText(c), c.asset_count, c.utility_count, c.plant_count,
      c.active_grant_count, c.notes ?? '',
    ]);
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `complessi_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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
    this.service.list(toSearchParams(this.filterDefs, this.filterValues) as ComplexFilters).subscribe({
      next: rows => {
        this.dataSource.data = rows;
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento complessi:', err);
      },
    });
  }
}
