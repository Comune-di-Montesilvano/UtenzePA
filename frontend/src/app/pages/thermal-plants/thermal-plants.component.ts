import {AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
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
import {AssetService} from '../assets/asset.service';
import {TOption} from '../../core/types/option.interface';
import {
  certificationStatus,
  missingCertifications,
  ThermalPlant,
  ThermalPlantService,
} from '../assets/thermal-plants/thermal-plant.service';
import {
  ThermalPlantEditDialogComponent,
  ThermalPlantEditDialogData,
} from '../assets/thermal-plants/thermal-plant-edit-dialog.component';

type ObligationFilter = 'all' | 'missing' | 'vvf' | 'inail' | 'efficiency';

const assetLabel = (p: ThermalPlant): string => p.asset?.asset_name ?? '';

// Vista dedicata agli impianti termici di tutti gli immobili. Non usa
// AbstractComponent/AbstractDataTable: creazione annidata sotto l'immobile e
// filtri calcolati sugli obblighi, tutto lato client (poche decine di righe).
@Component({
  selector: 'app-thermal-plants',
  standalone: true,
  imports: [
    FormsModule, MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, HasRoleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <div>
        <h1>Impianti termici</h1>
        <p style="color: #6A7282;">Centrali termiche e climatizzazione degli immobili, con gli obblighi derivati dalla potenza</p>
      </div>

      <div style="margin-top: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;">
        <mat-form-field style="flex: 1 1 300px;" subscriptSizing="dynamic">
          <input matInput placeholder="Cerca immobile, impianto, PDR, pratica..." [(ngModel)]="query" (ngModelChange)="applyFilter()">
        </mat-form-field>
        <mat-form-field style="flex: 0 1 280px;" subscriptSizing="dynamic">
          <mat-label>Obblighi</mat-label>
          <mat-select [(ngModel)]="obligation" (ngModelChange)="applyFilter()">
            <mat-option value="all">Tutti gli impianti</mat-option>
            <mat-option value="missing">Certificazioni mancanti</mat-option>
            <mat-option value="vvf">Soggetti a VVF (&gt; 116 kW)</mat-option>
            <mat-option value="inail">Soggetti a INAIL (&gt; 35 kW)</mat-option>
            <mat-option value="efficiency">Controllo efficienza (≥ 10 kW)</mat-option>
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
        {{ dataSource.filteredData.length }} impianti · {{ totalPower() }} kW complessivi
        @if (missingCount() > 0) {
          · <a href="" (click)="$event.preventDefault(); obligation = 'missing'; applyFilter()" style="color: #b91c1c;">
            {{ missingCount() }} con certificazioni mancanti
          </a>
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
          <ng-container matColumnDef="asset">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Immobile</th>
            <td mat-cell *matCellDef="let item">
              <a href="" (click)="$event.preventDefault(); openAsset(item)" matTooltip="Apri l'immobile">{{ item.asset?.asset_name }}</a>
              @if (item.asset?.associated_building) {
                <div style="color: #6b7280; font-size: 0.75rem;">{{ item.asset.associated_building }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Impianto</th>
            <td mat-cell *matCellDef="let item">{{ item.name }}</td>
          </ng-container>
          <ng-container matColumnDef="power_kw">
            <th mat-header-cell *matHeaderCellDef mat-sort-header style="text-align: right;">Potenza</th>
            <td mat-cell *matCellDef="let item" style="text-align: right; white-space: nowrap;">
              {{ item.power_kw !== null ? item.power_kw.toLocaleString('it-IT') + ' kW' : '—' }}
              @if (item.generators_description) {
                <div style="color: #6b7280; font-size: 0.75rem;">{{ item.generators_description }}</div>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="utility">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Alimentazione</th>
            <td mat-cell *matCellDef="let item">{{ item.utility?.utility_id ?? '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="vvf">
            <th mat-header-cell *matHeaderCellDef>VVF</th>
            <td mat-cell *matCellDef="let item">
              @let s = cert(item.vvf_required, item.vvf_exempt, item.vvf_certification);
              <span [style.background]="s.bg" [style.color]="s.fg" [matTooltip]="s.text" class="tp-badge">{{ s.text }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="inail">
            <th mat-header-cell *matHeaderCellDef>INAIL</th>
            <td mat-cell *matCellDef="let item">
              @let s = cert(item.inail_required, item.inail_exempt, item.inail_certification);
              <span [style.background]="s.bg" [style.color]="s.fg" [matTooltip]="s.text" class="tp-badge">{{ s.text }}</span>
            </td>
          </ng-container>
          <ng-container matColumnDef="efficiency">
            <th mat-header-cell *matHeaderCellDef>Controllo efficienza</th>
            <td mat-cell *matCellDef="let item">{{ item.efficiency_check_required ? 'Obbligatorio' : 'Non richiesto' }}</td>
          </ng-container>
          <ng-container matColumnDef="served_area_sqm">
            <th mat-header-cell *matHeaderCellDef mat-sort-header style="text-align: right;">Mq</th>
            <td mat-cell *matCellDef="let item" style="text-align: right;">{{ item.served_area_sqm?.toLocaleString('it-IT') ?? '' }}</td>
          </ng-container>
          <ng-container matColumnDef="climate">
            <th mat-header-cell *matHeaderCellDef>Climatizzazione</th>
            <td mat-cell *matCellDef="let item" style="font-size: 0.8rem;">{{ climate(item) }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: columns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell" [attr.colspan]="columns.length" style="padding: 1rem; color: #6b7280;">Nessun impianto trovato.</td>
          </tr>
        </table>
      </div>
      <mat-paginator [pageSizeOptions]="[25, 50, 100]" [pageSize]="50" showFirstLastButtons></mat-paginator>
      <p style="color: #6b7280; font-size: 0.75rem;">
        Obblighi indicativi calcolati dalla potenza: controllo di efficienza da 10 kW (DPR 74/2013), INAIL oltre 35 kW, VVF oltre 116 kW (DPR 151/2011).
      </p>
    </div>
  `,
  styles: [`
    .tp-badge {
      display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;
    }
  `],
})
export class ThermalPlantsComponent implements OnInit, AfterViewInit {
  private service = inject(ThermalPlantService);
  private assetService = inject(AssetService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private router = inject(Router);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly columns = ['actions', 'asset', 'name', 'power_kw', 'utility', 'vvf', 'inail', 'efficiency', 'served_area_sqm', 'climate'];
  readonly cert = certificationStatus;

  dataSource = new MatTableDataSource<ThermalPlant>([]);
  loading = false;
  query = '';
  obligation: ObligationFilter = 'all';
  private assetOptions: TOption[] = [];

  ngOnInit(): void {
    this.dataSource.sortingDataAccessor = (p, column) => {
      switch (column) {
        case 'asset': return assetLabel(p).toLowerCase();
        case 'utility': return p.utility?.utility_id ?? '';
        case 'power_kw': return p.power_kw ?? -1;
        case 'served_area_sqm': return p.served_area_sqm ?? -1;
        default: return String((p as unknown as Record<string, unknown>)[column] ?? '').toLowerCase();
      }
    };
    this.dataSource.filterPredicate = (p, raw) => {
      const {query, obligation} = JSON.parse(raw) as {query: string; obligation: ObligationFilter};
      if (obligation === 'missing' && missingCertifications(p).length === 0) return false;
      if (obligation === 'vvf' && !p.vvf_required) return false;
      if (obligation === 'inail' && !p.inail_required) return false;
      if (obligation === 'efficiency' && !p.efficiency_check_required) return false;
      if (!query) return true;
      const haystack = [assetLabel(p), p.asset?.associated_building, p.name, p.utility?.utility_id, p.vvf_certification,
        p.inail_certification, p.generators_description, p.notes].join(' ').toLowerCase();
      return haystack.includes(query);
    };
    this.reload();
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => this.assetOptions = assets
        .map(a => ({label: a.asset_name ?? '', value: a.id, sublabel: a.associated_building ?? undefined,
          searchText: `${a.asset_name ?? ''} ${a.associated_building ?? ''}`}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore caricamento immobili:', err),
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  applyFilter(): void {
    this.dataSource.filter = JSON.stringify({query: this.query.trim().toLowerCase(), obligation: this.obligation});
    this.paginator?.firstPage();
  }

  totalPower(): string {
    const total = this.dataSource.filteredData.reduce((sum, p) => sum + (p.power_kw ?? 0), 0);
    return total.toLocaleString('it-IT', {maximumFractionDigits: 2});
  }

  missingCount(): number {
    return this.dataSource.data.filter(p => missingCertifications(p).length > 0).length;
  }

  climate(p: ThermalPlant): string {
    const parts: string[] = [];
    if (p.outdoor_units) parts.push(`${p.outdoor_units} est.`);
    if (p.indoor_units) parts.push(`${p.indoor_units} int.`);
    if (p.fan_coils) parts.push(`${p.fan_coils} fancoil`);
    if (p.air_handling_units) parts.push(`${p.air_handling_units} UTA`);
    if (p.chillers_heat_pumps) parts.push(`${p.chillers_heat_pumps} frigo/PdC`);
    return parts.join(' · ');
  }

  openAsset(p: ThermalPlant): void {
    this.router.navigate(['/building'], {queryParams: {selectedId: p.asset_id_fk}});
  }

  openDialog(item?: ThermalPlant): void {
    const role = this.auth.getCurrentUser()?.role;
    this.dialog.open<ThermalPlantEditDialogComponent, ThermalPlantEditDialogData, boolean>(ThermalPlantEditDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      data: {
        assetId: item ? item.asset_id_fk : null,
        assetOptions: this.assetOptions,
        item,
        readOnly: !role || role === 'Lettore',
      },
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(p: ThermalPlant): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina impianto', message: `Eliminare l'impianto "${p.name}"?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(p.id).subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore eliminazione impianto:', err),
      });
    });
  }

  exportCsv(): void {
    const header = ['Immobile', 'Edificio', 'Impianto', 'Potenza (kW)', 'Generatori', 'Alimentazione',
      'Certificazione VVF', 'Esente VVF', 'VVF richiesto', 'Certificazione INAIL', 'Esente INAIL', 'INAIL richiesto',
      'Controllo efficienza', 'Mq', 'Locale idrico', 'Unità esterne', 'Unità interne', 'Ventilconvettori', 'UTA',
      'Gruppi frigo/PdC', 'Note'];
    const yesNo = (v: boolean | null | undefined) => (v === true ? 'Sì' : v === false ? 'No' : '');
    const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : v.toLocaleString('it-IT'));
    const rows = this.dataSource.filteredData.map(p => [
      assetLabel(p), p.asset?.associated_building ?? '', p.name, num(p.power_kw), p.generators_description ?? '',
      p.utility?.utility_id ?? '', p.vvf_certification ?? '', yesNo(p.vvf_exempt), yesNo(p.vvf_required),
      p.inail_certification ?? '', yesNo(p.inail_exempt), yesNo(p.inail_required), yesNo(p.efficiency_check_required),
      num(p.served_area_sqm), yesNo(p.water_room), num(p.outdoor_units), num(p.indoor_units), num(p.fan_coils),
      num(p.air_handling_units), num(p.chillers_heat_pumps), p.notes ?? '',
    ]);
    const csv = '﻿' + [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `impianti_termici_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private reload(): void {
    this.loading = true;
    this.service.listAll().subscribe({
      next: rows => {
        this.dataSource.data = rows;
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        console.error('Errore caricamento impianti termici:', err);
      },
    });
  }
}
