import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilizerGrantService} from './utilizer-grant.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {UtilizerGrantEditDialogComponent} from './utilizer-grant-edit-dialog.component';
import {DIRECTION_LABEL, formatDateIt, formatEuro, KIND_LABEL, STATUS_LABEL, statusBadge} from './real-estate-contract.model';

// Contratti immobiliari dell'immobile, dentro il dialog immobile. I dati
// arrivano da GET utilizer-grant?asset_id (con i campi calcolati), non da
// asset.utilizerGrants.
@Component({
  selector: 'app-asset-real-estate-contracts-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0;">
      <div>
        <button mat-stroked-button type="button" (click)="open()" [appHasRole]="['Admin','Operatore']">
          <mat-icon>add</mat-icon> Nuovo contratto
        </button>
      </div>
      @if (rows.length === 0) {
        <p style="color: #6A7282; margin: 0;">Nessun contratto immobiliare per questo immobile.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 900px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Direzione</th>
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Controparte</th>
                <th style="padding: 6px;">Oggetto</th>
                <th style="padding: 6px; text-align: right;">Canone annuo</th>
                <th style="padding: 6px;">Scadenza</th>
                <th style="padding: 6px;">Stato</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (g of rows; track g.id) {
                @let b = badgeOf(g);
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">{{ directionText(g) }}</td>
                  <td style="padding: 6px;">{{ kindText(g) }}</td>
                  <td style="padding: 6px;">{{ g.utilizer?.name }}</td>
                  <td style="padding: 6px;">{{ g.subject ?? '' }}</td>
                  <td style="padding: 6px; text-align: right; white-space: nowrap;">{{ euro(g.annual_rent) }}</td>
                  <td style="padding: 6px;">{{ dateIt(g.effective_end_date) }}</td>
                  <td style="padding: 6px;">
                    <span [style.background]="b.bg" [style.color]="b.fg"
                          style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; white-space: nowrap;">{{ statusText(g) }}</span>
                  </td>
                  <td style="padding: 6px; text-align: right;">
                    <button mat-icon-button type="button" (click)="open(g)" matTooltip="Apri contratto">
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
export class AssetRealEstateContractsTabComponent implements OnInit {
  private service = inject(UtilizerGrantService);
  private dialog = inject(MatDialog);

  @Input({required: true}) assetId!: number;

  rows: UtilizerGrant[] = [];
  readonly euro = formatEuro;
  readonly dateIt = formatDateIt;

  ngOnInit(): void {
    this.reload();
  }

  directionText(g: UtilizerGrant): string {
    return g.direction ? DIRECTION_LABEL[g.direction] : '';
  }

  kindText(g: UtilizerGrant): string {
    return g.kind ? KIND_LABEL[g.kind] : '';
  }

  statusText(g: UtilizerGrant): string {
    return g.computed_status ? STATUS_LABEL[g.computed_status] : '';
  }

  badgeOf(g: UtilizerGrant): {bg: string; fg: string} {
    return statusBadge(g.computed_status ?? 'ACTIVE');
  }

  open(item?: UtilizerGrant): void {
    const isNew = !item;
    const target = item ?? UtilizerGrant.create({asset_ids: [this.assetId]});
    this.dialog.open<UtilizerGrantEditDialogComponent, EditDialogData<UtilizerGrant>, UtilizerGrant | undefined>(
      UtilizerGrantEditDialogComponent,
      {width: '1000px', maxWidth: '1000px', data: {mode: isNew ? 'create' : 'edit', item: target}},
    ).afterClosed().subscribe(result => {
      if (!result) return;
      const request = isNew ? this.service.create(result) : this.service.update(result.id, result);
      request.subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore salvataggio contratto immobiliare:', err),
      });
    });
  }

  private reload(): void {
    this.service.search({asset_id: this.assetId} as never).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento contratti immobiliari:', err),
    });
  }
}
