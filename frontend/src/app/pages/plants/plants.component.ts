import {AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {MatDialog} from '@angular/material/dialog';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule, PageEvent} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {AuthService} from '../../services/auth.service';
import {PlantFilters, PlantService} from './plant.service';
import {
  INSPECTION_LABEL,
  inspectionBadge,
  Plant,
  PLANT_STATUS_LABEL,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  PlantType,
  POSITION_LABEL,
  positionBadge,
} from './plant.model';
import {PlantEditDialogComponent, PlantEditDialogData} from './plant-edit-dialog.component';
import {openSheet} from '../../core/components/entity-sheet/sheet-utils';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import type {FilterValues} from '../../core/components/list/filter-def';
import {fromQueryParams, toSearchParams} from '../../core/components/list/filter-values';
import {plantFilters} from './plants-filters';

// Colonne visibili ricordate (tutte, se nessuna scelta salvata).
const COLUMNS_KEY = 'columns:plants';
const readColumns = (all: IColumnDef[]): IColumnDef[] => {
  try {
    const fields: string[] = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? '[]');
    const cols = all.filter(c => fields.includes(c.field));
    return cols.length ? cols : all;
  } catch {
    return all;
  }
};

// Righe per pagina ricordate, come negli elenchi su AbstractDataTableComponent.
const PAGE_SIZE_KEY = 'list-page-size:Impianti';
const readPageSize = (): number => {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return [25, 50, 100].includes(n) ? n : 25;
  } catch {
    return 25;
  }
};


// Impianti di ogni tipo (termici, ascensori, antincendio, fontane, punti luce…).
// Filtri lato server (tipo/stato/verifiche/posizione), ricerca libera lato
// client sui risultati caricati.
@Component({
  selector: 'app-plants',
  standalone: true,
  imports: [
    FormsModule, MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, HasRoleDirective,
    ListFiltersComponent, ListToolbarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <h1>Impianti</h1>
      <p class="list-subtitle">Impianti tecnologici degli immobili e del territorio: dati tecnici, verifiche periodiche, utenze collegate.</p>
      <app-list-filters [defs]="filterDefs" [values]="filterValues" placeholder="Cerca codice, nome, indirizzo, immobile, utenza..."
                        (valuesChange)="onFilters($event)" (quickSearch)="query = $event; applyFilter()"></app-list-filters>

      <div style="margin-top: 1rem;">
        <app-list-toolbar [count]="dataSource.filteredData.length" createLabel="Nuovo impianto"
                          [columns]="allColumns" [selectedColumns]="selectedColumns"
                          (selectedColumnsChange)="onColumnsChange($event)"
                          [exportable]="true" (export)="exportCsv()" (create)="openDialog()"></app-list-toolbar>
        @if (typeCounts().length > 1) {
          <div style="margin-bottom: 0.5rem; color: #6b7280; font-size: 0.85rem;">
            @for (c of typeCounts(); track c.type; let first = $first) {
              {{ first ? '' : ' · ' }}{{ c.count }} {{ typeLabel[c.type].toLowerCase() }}
            }
          </div>
        }
      </div>

      @if (loading) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      <div style="margin-top: 0.75rem; overflow-x: auto;">
        <table mat-table [dataSource]="dataSource" matSort style="width: 100%; min-width: 1100px;">
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef style="width: 110px;">Azioni</th>
            <td mat-cell *matCellDef="let item" style="white-space: nowrap;">
              <button mat-icon-button (click)="openDialog(item)" matTooltip="Dettaglio impianto"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button (click)="remove(item)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <ng-container matColumnDef="type">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
            <td mat-cell *matCellDef="let item" style="white-space: nowrap;">
              <mat-icon style="vertical-align: middle; color: #4b5563; margin-right: 4px;">{{ typeIcon[asPlant(item).type] }}</mat-icon>{{ typeLabel[asPlant(item).type] }}
            </td>
          </ng-container>
          <ng-container matColumnDef="code">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Codice</th>
            <td mat-cell *matCellDef="let item">{{ item.code }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
            <td mat-cell *matCellDef="let item">
              {{ item.name }}
              @if (item.address) {
                <div style="color: #6b7280; font-size: 0.75rem;">{{ item.address }} {{ item.civic_number ?? '' }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="asset">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Immobili</th>
            <td mat-cell *matCellDef="let item">
              @for (a of asPlant(item).assets; track a.id; let last = $last) {
                <a href="" (click)="$event.preventDefault(); openAsset(a.id)" matTooltip="Apri l'immobile">{{ a.asset_name }}</a>{{ last ? '' : ', ' }}
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="utilities">
            <th mat-header-cell *matHeaderCellDef>Utenze</th>
            <td mat-cell *matCellDef="let item" style="font-size: 0.8rem;">{{ utilitiesText(item) }}</td>
          </ng-container>
          <ng-container matColumnDef="position">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Posizione</th>
            <td mat-cell *matCellDef="let item">
              @let pb = posBadge(item);
              <span [style.background]="pb.bg" [style.color]="pb.fg" class="pl-badge">{{ positionLabel[asPlant(item).position_quality] }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="inspection">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Verifiche</th>
            <td mat-cell *matCellDef="let item">
              @if (item.inspection_status) {
                @let ib = inspBadge(item);
                <span [style.background]="ib.bg" [style.color]="ib.fg" class="pl-badge">{{ inspectionText(item) }}</span>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Stato</th>
            <td mat-cell *matCellDef="let item">{{ statusLabel[asPlant(item).status] }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: columns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell" [attr.colspan]="columns.length" style="padding: 1rem; color: #6b7280;">Nessun impianto trovato.</td>
          </tr>
        </table>
      </div>
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" [pageSize]="pageSize" showFirstLastButtons (page)="onPage($event)"></mat-paginator>
    </div>
  `,
  styles: [`
    .pl-badge {
      display: inline-block; white-space: nowrap; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;
    }
  `],
})
export class PlantsComponent implements OnInit, AfterViewInit {
  private service = inject(PlantService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly allColumns: IColumnDef[] = [
    {field: 'type', header: 'Tipo'}, {field: 'code', header: 'Codice'}, {field: 'name', header: 'Nome'},
    {field: 'asset', header: 'Immobili'}, {field: 'utilities', header: 'Utenze'}, {field: 'position', header: 'Posizione'},
    {field: 'inspection', header: 'Verifiche'}, {field: 'status', header: 'Stato'},
  ];
  selectedColumns: IColumnDef[] = readColumns(this.allColumns);

  get columns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  onColumnsChange(cols: IColumnDef[]): void {
    this.selectedColumns = cols;
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(cols.map(c => c.field)));
    } catch {
      // storage non disponibile: vale solo per questa sessione
    }
  }
  readonly typeLabel = PLANT_TYPE_LABEL;
  readonly typeIcon = PLANT_TYPE_ICON;
  readonly statusLabel = PLANT_STATUS_LABEL;
  readonly positionLabel = POSITION_LABEL;

  dataSource = new MatTableDataSource<Plant>([]);
  loading = false;
  query = '';
  readonly filterDefs = plantFilters();
  filterValues: FilterValues = {};
  pageSize = readPageSize();

  ngOnInit(): void {
    this.dataSource.sortingDataAccessor = (p, column) => {
      switch (column) {
        case 'type': return PLANT_TYPE_LABEL[p.type];
        case 'asset': return this.assetsText(p).toLowerCase();
        case 'position': return p.position_quality;
        case 'inspection': return p.inspection_status ?? '';
        default: return String((p as unknown as Record<string, unknown>)[column] ?? '').toLowerCase();
      }
    };
    this.dataSource.filterPredicate = (p, q) => {
      if (!q) return true;
      const haystack = [p.code, p.name, p.address, p.toponym, ...(p.assets ?? []).flatMap(a => [a.asset_name, a.associated_building]),
        ...(p.utilities ?? []).map(u => u.utility_id), p.notes].join(' ').toLowerCase();
      return haystack.includes(q);
    };
    // Link dalla dashboard: ?type=, ?inspection=, ?position= valorizzano i filtri.
    this.filterValues = fromQueryParams(this.filterDefs, this.route.snapshot.queryParams);
    this.reload();
    const selectedId = Number(this.route.snapshot.queryParamMap.get('selectedId'));
    if (selectedId) this.openDialog(undefined, selectedId);
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  asPlant(p: Plant): Plant {
    return p;
  }

  posBadge(p: Plant): {bg: string; fg: string} {
    return positionBadge(p.position_quality);
  }

  inspBadge(p: Plant): {bg: string; fg: string} {
    return inspectionBadge(p.inspection_status);
  }

  inspectionText(p: Plant): string {
    return p.inspection_status ? INSPECTION_LABEL[p.inspection_status] : '';
  }

  utilitiesText(p: Plant): string {
    return (p.utilities ?? []).map(u => u.utility_id).join(', ');
  }

  typeCounts(): {type: PlantType; count: number}[] {
    const counts = new Map<PlantType, number>();
    for (const p of this.dataSource.filteredData) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({type, count})).sort((a, b) => b.count - a.count);
  }

  applyFilter(): void {
    this.dataSource.filter = this.query.trim().toLowerCase();
    this.paginator?.firstPage();
  }

  assetsText(p: Plant): string {
    return (p.assets ?? []).map(a => a.asset_name).join(', ');
  }

  openAsset(assetId: number): void {
    this.router.navigate(['/building'], {queryParams: {selectedId: assetId}});
  }

  openDialog(item?: Plant, plantId?: number): void {
    const role = this.auth.getCurrentUser()?.role;
    openSheet<PlantEditDialogComponent, PlantEditDialogData, boolean>(this.dialog, PlantEditDialogComponent, {
      plantId: item?.id ?? plantId ?? null,
      readOnly: !role || role === 'Lettore',
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(p: Plant): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina impianto', message: `Eliminare l'impianto "${p.code} — ${p.name}"?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(p.id).subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore eliminazione impianto:', err),
      });
    });
  }

  exportCsv(): void {
    const header = ['Codice', 'Tipo', 'Nome', 'Immobili', 'Indirizzo', 'Utenze', 'Posizione', 'Verifiche', 'Stato', 'Note'];
    const rows = this.dataSource.filteredData.map(p => [
      p.code, PLANT_TYPE_LABEL[p.type], p.name, this.assetsText(p),
      [p.address, p.civic_number].filter(Boolean).join(' '), this.utilitiesText(p),
      POSITION_LABEL[p.position_quality], this.inspectionText(p), PLANT_STATUS_LABEL[p.status], p.notes ?? '',
    ]);
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `impianti_${new Date().toISOString().slice(0, 10)}.csv`;
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
    this.service.list(toSearchParams(this.filterDefs, this.filterValues) as PlantFilters).subscribe({
      next: rows => {
        this.dataSource.data = rows;
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento impianti:', err);
      },
    });
  }
}
