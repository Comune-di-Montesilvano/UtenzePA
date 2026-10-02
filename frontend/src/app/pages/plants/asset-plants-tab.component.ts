import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {AuthService} from '../../services/auth.service';
import {PlantService} from './plant.service';
import {
  INSPECTION_LABEL,
  inspectionBadge,
  Plant,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  POSITION_LABEL,
  positionBadge,
} from './plant.model';
import {PlantEditDialogComponent, PlantEditDialogData} from './plant-edit-dialog.component';

// Impianti contenuti nell'immobile (tab del dialog immobile), di ogni tipo.
@Component({
  selector: 'app-asset-plants-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0;">
      <div>
        <button mat-stroked-button type="button" (click)="open()" [appHasRole]="['Admin','Operatore']">
          <mat-icon>add</mat-icon> Nuovo impianto
        </button>
      </div>
      @if (rows.length === 0) {
        <p style="color: #6A7282; margin: 0;">Nessun impianto censito in questo immobile.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 800px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Codice</th>
                <th style="padding: 6px;">Nome</th>
                <th style="padding: 6px;">Utenze</th>
                <th style="padding: 6px;">Verifiche</th>
                <th style="padding: 6px;">Posizione</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (p of rows; track p.id) {
                @let ib = inspBadge(p);
                @let pb = posBadge(p);
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px; white-space: nowrap;">
                    <mat-icon style="vertical-align: middle; color: #4b5563; margin-right: 4px;">{{ typeIcon(p) }}</mat-icon>{{ typeLabel(p) }}
                  </td>
                  <td style="padding: 6px;">{{ p.code }}</td>
                  <td style="padding: 6px;">{{ p.name }}</td>
                  <td style="padding: 6px;">{{ utilitiesText(p) }}</td>
                  <td style="padding: 6px;">
                    @if (p.inspection_status) {
                      <span [style.background]="ib.bg" [style.color]="ib.fg"
                            style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; white-space: nowrap;">{{ inspectionText(p) }}</span>
                    }
                  </td>
                  <td style="padding: 6px;">
                    <span [style.background]="pb.bg" [style.color]="pb.fg"
                          style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; white-space: nowrap;">{{ positionText(p) }}</span>
                  </td>
                  <td style="padding: 6px; text-align: right;">
                    <button mat-icon-button type="button" (click)="open(p)" matTooltip="Apri impianto">
                      <mat-icon>description</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class AssetPlantsTabComponent implements OnInit {
  private service = inject(PlantService);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);

  @Input({required: true}) assetId!: number;

  rows: Plant[] = [];

  ngOnInit(): void {
    this.reload();
  }

  typeIcon(p: Plant): string {
    return PLANT_TYPE_ICON[p.type];
  }

  typeLabel(p: Plant): string {
    return PLANT_TYPE_LABEL[p.type];
  }

  utilitiesText(p: Plant): string {
    return (p.utilities ?? []).map(u => u.utility_id).join(', ');
  }

  inspBadge(p: Plant): {bg: string; fg: string} {
    return inspectionBadge(p.inspection_status);
  }

  inspectionText(p: Plant): string {
    return p.inspection_status ? INSPECTION_LABEL[p.inspection_status] : '';
  }

  posBadge(p: Plant): {bg: string; fg: string} {
    return positionBadge(p.position_quality);
  }

  positionText(p: Plant): string {
    return POSITION_LABEL[p.position_quality];
  }

  open(p?: Plant): void {
    const role = this.auth.getCurrentUser()?.role;
    this.dialog.open<PlantEditDialogComponent, PlantEditDialogData, boolean>(PlantEditDialogComponent, {
      width: '1000px',
      maxWidth: '1000px',
      data: {plantId: p?.id ?? null, assetId: this.assetId, readOnly: !role || role === 'Lettore'},
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  private reload(): void {
    this.service.list({asset_id: this.assetId}).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento impianti:', err),
    });
  }
}
