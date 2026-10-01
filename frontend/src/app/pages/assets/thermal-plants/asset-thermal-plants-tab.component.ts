import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {AuthService} from '../../../services/auth.service';
import {certificationStatus, ThermalPlant, ThermalPlantService} from './thermal-plant.service';
import {ThermalPlantEditDialogComponent, ThermalPlantEditDialogData} from './thermal-plant-edit-dialog.component';

@Component({
  selector: 'app-asset-thermal-plants-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0;">
      <div>
        <button mat-stroked-button type="button" (click)="openDialog()" [appHasRole]="['Admin','Operatore']">
          <mat-icon>add</mat-icon> Aggiungi impianto
        </button>
      </div>
      @if (rows.length === 0) {
        <p style="color: #6A7282; margin: 0;">Nessun impianto termico censito per questo immobile.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 900px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Impianto</th>
                <th style="padding: 6px; text-align: right;">Potenza</th>
                <th style="padding: 6px;">Alimentazione</th>
                <th style="padding: 6px;">VVF</th>
                <th style="padding: 6px;">INAIL</th>
                <th style="padding: 6px;">Controllo efficienza</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.id) {
                @let vvf = cert(row.vvf_required, row.vvf_exempt, row.vvf_certification);
                @let inail = cert(row.inail_required, row.inail_exempt, row.inail_certification);
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">{{ row.name }}</td>
                  <td style="padding: 6px; text-align: right; white-space: nowrap;">
                    {{ row.power_kw !== null ? row.power_kw.toLocaleString('it-IT') + ' kW' : '—' }}
                    @if (row.generators_description) {
                      <span style="color: #6b7280;">({{ row.generators_description }})</span>
                    }
                  </td>
                  <td style="padding: 6px;">{{ row.utility?.utility_id ?? '—' }}</td>
                  <td style="padding: 6px;">
                    <span [style.background]="vvf.bg" [style.color]="vvf.fg" [matTooltip]="vvf.text"
                          style="display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;">{{ vvf.text }}</span>
                  </td>
                  <td style="padding: 6px;">
                    <span [style.background]="inail.bg" [style.color]="inail.fg" [matTooltip]="inail.text"
                          style="display: inline-block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;">{{ inail.text }}</span>
                  </td>
                  <td style="padding: 6px;">{{ row.efficiency_check_required ? 'Obbligatorio (≥ 10 kW)' : 'Non richiesto' }}</td>
                  <td style="padding: 6px; white-space: nowrap; text-align: right;">
                    <button mat-icon-button type="button" (click)="openDialog(row)" matTooltip="Dettaglio">
                      <mat-icon>description</mat-icon>
                    </button>
                    <button mat-icon-button type="button" (click)="remove(row)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p style="color: #6b7280; font-size: 0.75rem; margin: 0;">
          Obblighi indicativi calcolati dalla potenza: controllo di efficienza da 10 kW (DPR 74/2013), INAIL oltre 35 kW, VVF oltre 116 kW (DPR 151/2011).
        </p>
      }
    </div>
  `,
})
export class AssetThermalPlantsTabComponent implements OnInit {
  private service = inject(ThermalPlantService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  @Input({required: true}) assetId!: number;

  readonly cert = certificationStatus;
  rows: ThermalPlant[] = [];

  ngOnInit(): void {
    this.reload();
  }

  openDialog(item?: ThermalPlant): void {
    const role = this.auth.getCurrentUser()?.role;
    this.dialog.open<ThermalPlantEditDialogComponent, ThermalPlantEditDialogData, boolean>(ThermalPlantEditDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      data: {assetId: this.assetId, item, readOnly: !role || role === 'Lettore'},
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(row: ThermalPlant): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina impianto', message: `Eliminare l'impianto "${row.name}"?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(row.id).subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore eliminazione impianto:', err),
      });
    });
  }

  private reload(): void {
    this.service.listByAsset(this.assetId).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento impianti termici:', err),
    });
  }
}
