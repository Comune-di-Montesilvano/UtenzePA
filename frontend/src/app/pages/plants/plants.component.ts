import {AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {MatDialog} from '@angular/material/dialog';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
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
import {PlantService} from './plant.service';
import {
  INSPECTION_LABEL,
  inspectionBadge,
  Plant,
  PLANT_STATUS_LABEL,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  PLANT_TYPES,
  PlantStatus,
  PlantType,
  POSITION_LABEL,
  positionBadge,
} from './plant.model';
import {PlantEditDialogComponent, PlantEditDialogData} from './plant-edit-dialog.component';
import {openSheet} from '../../core/components/entity-sheet/sheet-utils';

type InspectionFilter = '' | 'overdue' | 'due_soon';
type PositionFilter = '' | 'precise' | 'from_asset' | 'estimated' | 'missing';

// Impianti di ogni tipo (termici, ascensori, antincendio, fontane, punti luce…).
// Filtri lato server (tipo/stato/verifiche/posizione), ricerca libera lato
// client sui risultati caricati.
@Component({
  selector: 'app-plants',
  standalone: true,
  imports: [
    FormsModule, MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, HasRoleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <div>
        <h1>Impianti</h1>
        <p style="color: #6A7282;">Impianti tecnologici degli immobili e del territorio: dati tecnici, verifiche periodiche, utenze collegate</p>
      </div>

      <div style="margin-top: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;">
        <mat-form-field style="flex: 1 1 260px;" subscriptSizing="dynamic">
          <input matInput placeholder="Cerca codice, nome, indirizzo, immobile, utenza..." [(ngModel)]="query" (ngModelChange)="applyFilter()">
        </mat-form-field>
        <mat-form-field style="flex: 0 1 240px;" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-select [(ngModel)]="type" (ngModelChange)="reload()">
            <mat-select-trigger>{{ type ? typeLabel[type] : 'Tutti i tipi' }}</mat-select-trigger>
            <mat-option value="">Tutti i tipi</mat-option>
            @for (t of types; track t) {
              <mat-option [value]="t"><span><mat-icon style="vertical-align: middle; margin-right: 6px;">{{ typeIcon[t] }}</mat-icon>{{ typeLabel[t] }}</span></mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 0 1 170px;" subscriptSizing="dynamic">
          <mat-label>Stato</mat-label>
          <mat-select [(ngModel)]="status" (ngModelChange)="reload()">
            <mat-option value="">Tutti</mat-option>
            @for (s of statuses; track s) {
              <mat-option [value]="s">{{ statusLabel[s] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 0 1 200px;" subscriptSizing="dynamic">
          <mat-label>Verifiche</mat-label>
          <mat-select [(ngModel)]="inspection" (ngModelChange)="reload()">
            <mat-option value="">Tutte</mat-option>
            <mat-option value="overdue">Scadute</mat-option>
            <mat-option value="due_soon">Entro 60 giorni</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 0 1 190px;" subscriptSizing="dynamic">
          <mat-label>Posizione</mat-label>
          <mat-select [(ngModel)]="position" (ngModelChange)="reload()">
            <mat-option value="">Tutte</mat-option>
            <mat-option value="precise">Precisa</mat-option>
            <mat-option value="from_asset">Dall'immobile</mat-option>
            <mat-option value="estimated">Stimata</mat-option>
            <mat-option value="missing">Assente</mat-option>
          </mat-select>
        </mat-form-field>
        <span style="flex: 1;"></span>
        <button mat-stroked-button (click)="exportCsv()" style="height: 3.5rem;">
          <mat-icon>ios_share</mat-icon> Esporta CSV
        </button>
        <button mat-flat-button (click)="openDialog()" [appHasRole]="['Admin','Operatore']" style="height: 3.5rem;">
          <mat-icon>add</mat-icon> Nuovo impianto
        </button>
      </div>

      <div style="margin-top: 0.75rem; color: #6b7280; font-size: 0.85rem;">
        {{ dataSource.filteredData.length }} impianti
        @for (c of typeCounts(); track c.type) {
          · {{ c.count }} {{ typeLabel[c.type].toLowerCase() }}
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
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" [pageSize]="50" showFirstLastButtons></mat-paginator>
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

  readonly columns = ['actions', 'type', 'code', 'name', 'asset', 'utilities', 'position', 'inspection', 'status'];
  readonly types = PLANT_TYPES;
  readonly typeLabel = PLANT_TYPE_LABEL;
  readonly typeIcon = PLANT_TYPE_ICON;
  readonly statuses = Object.keys(PLANT_STATUS_LABEL) as PlantStatus[];
  readonly statusLabel = PLANT_STATUS_LABEL;
  readonly positionLabel = POSITION_LABEL;

  dataSource = new MatTableDataSource<Plant>([]);
  loading = false;
  query = '';
  type: PlantType | '' = '';
  status: PlantStatus | '' = '';
  inspection: InspectionFilter = '';
  position: PositionFilter = '';

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
    const params = this.route.snapshot.queryParamMap;
    this.type = (params.get('type') as PlantType) ?? '';
    this.inspection = (params.get('inspection') as InspectionFilter) ?? '';
    this.position = (params.get('position') as PositionFilter) ?? '';
    this.reload();
    const selectedId = Number(params.get('selectedId'));
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

  reload(): void {
    this.loading = true;
    this.service.list({type: this.type, status: this.status, inspection: this.inspection, position: this.position}).subscribe({
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
