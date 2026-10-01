import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {ConsumptionChartComponent} from './consumption-chart.component';
import {ConsumptionEditDialogComponent, ConsumptionEditDialogData} from './consumption-edit-dialog.component';
import {UtilityConsumptionService} from './utility-consumption.service';
import {ConsumptionSummary, formatDateIt, formatQty, UtilityConsumption} from './consumption.model';

const SOURCE_LABEL: Record<UtilityConsumption['source'], string> = {
  MANUAL: 'Manuale', INVOICE: 'Fattura', IMPORT: 'Import', API: 'API',
};

@Component({
  selector: 'app-utility-consumptions-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective, ConsumptionChartComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 1.25rem; padding: 1rem 0;">
      @if (summary) {
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <div style="flex: 1 1 260px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
            <div style="color: #6b7280; font-size: 0.85rem;">Consumo effettivo ultimi 12 mesi</div>
            <div style="font-size: 1.5rem; font-weight: 600;">{{ formatQty(summary.actual_consumption, summary.unit) }}</div>
            <div style="color: #6b7280; font-size: 0.8rem;">
              Dati su {{ summary.coverage_days }}/365 giorni
              @if (summary.coverage_days < 365) { · valore parziale }
            </div>
          </div>
          <div style="flex: 1 1 260px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
            <div style="color: #6b7280; font-size: 0.85rem;">Consumo annuo stimato</div>
            <div style="font-size: 1.5rem; font-weight: 600;">{{ formatQty(summary.estimated_annual_consumption, summary.unit) }}</div>
            <span [style.background]="estimateBadge().bg" [style.color]="estimateBadge().fg"
                  style="display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;">
              {{ estimateBadge().text }}
            </span>
          </div>
        </div>

        <div>
          <div style="font-weight: 600; margin-bottom: 0.5rem;">Andamento mensile (24 mesi reali + 12 stimati)</div>
          <app-consumption-chart [points]="summary.monthly" [unit]="summary.unit"></app-consumption-chart>
        </div>
      }

      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 600;">Rilevazioni</span>
          <button mat-stroked-button type="button" (click)="openDialog()" [appHasRole]="['Admin','Operatore']">
            <mat-icon>add</mat-icon> Aggiungi rilevazione
          </button>
        </div>
        @if (rows.length === 0) {
          <p style="color: #6b7280;">Nessuna rilevazione inserita.</p>
        } @else {
          <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Data / periodo</th>
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Matricola</th>
                <th style="padding: 6px; text-align: right;">Lettura</th>
                <th style="padding: 6px; text-align: right;">Consumo</th>
                <th style="padding: 6px;">Origine</th>
                <th style="padding: 6px;">Note</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.id) {
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">
                    {{ row.kind === 'READING' ? formatDateIt(row.reading_date) : formatDateIt(row.period_start) + ' – ' + formatDateIt(row.period_end) }}
                  </td>
                  <td style="padding: 6px;">{{ row.kind === 'READING' ? 'Lettura' : 'Periodo' }}</td>
                  <td style="padding: 6px;">{{ row.meter_number ?? '' }}</td>
                  <td style="padding: 6px; text-align: right;">{{ row.kind === 'READING' ? formatQty(row.reading_value) : '' }}</td>
                  <td style="padding: 6px; text-align: right;">
                    @if (row.computed_consumption === null) {
                      <span style="color: #6b7280;" matTooltip="Nessun consumo calcolabile: prima lettura del contatore o lettura precedente di un contatore diverso">—</span>
                    } @else {
                      {{ formatQty(row.computed_consumption, summary?.unit) }}
                    }
                  </td>
                  <td style="padding: 6px;">{{ sourceLabel[row.source] }}</td>
                  <td style="padding: 6px;">{{ row.notes ?? '' }}</td>
                  <td style="padding: 6px; white-space: nowrap; text-align: right;">
                    <button mat-icon-button type="button" (click)="openDialog(row)" [appHasRole]="['Admin','Operatore']" matTooltip="Modifica">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button mat-icon-button type="button" (click)="remove(row)" [appHasRole]="['Admin','Operatore']" matTooltip="Elimina">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class UtilityConsumptionsTabComponent implements OnInit {
  private service = inject(UtilityConsumptionService);
  private dialog = inject(MatDialog);

  @Input({required: true}) utilityId!: number;
  @Input() meterNumber: string | null = null;
  @Output() summaryChanged = new EventEmitter<ConsumptionSummary>();

  readonly formatQty = formatQty;
  readonly formatDateIt = formatDateIt;
  readonly sourceLabel = SOURCE_LABEL;

  summary: ConsumptionSummary | null = null;
  rows: UtilityConsumption[] = [];

  ngOnInit(): void {
    this.reload();
  }

  estimateBadge(): {text: string; bg: string; fg: string} {
    const s = this.summary;
    if (!s) return {text: '', bg: 'transparent', fg: 'inherit'};
    if (s.estimated_source === 'MANUAL') {
      return s.estimated_valid_until && s.estimated_valid_until >= new Date().toISOString().slice(0, 10)
        ? {text: `Manuale — valida fino al ${formatDateIt(s.estimated_valid_until)}`, bg: '#fef3c7', fg: '#92400e'}
        : {text: 'Manuale — scaduta', bg: '#fee2e2', fg: '#991b1b'};
    }
    if (s.estimated_source === 'HISTORY') return {text: 'Da storico', bg: '#dcfce7', fg: '#166534'};
    return {text: 'Nessun dato', bg: '#f3f4f6', fg: '#374151'};
  }

  openDialog(item?: UtilityConsumption): void {
    this.dialog.open<ConsumptionEditDialogComponent, ConsumptionEditDialogData, boolean>(ConsumptionEditDialogComponent, {
      width: '720px',
      maxWidth: '720px',
      data: {utilityId: this.utilityId, meterNumber: this.meterNumber, item},
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(row: UtilityConsumption): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina rilevazione', message: 'Eliminare la rilevazione selezionata?', confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(row.id).subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore eliminazione rilevazione:', err),
      });
    });
  }

  // Il riepilogo è sempre propagato al dialog, anche al primo caricamento:
  // la riga di tabella da cui è aperto il dialog può essere precedente al
  // ricalcolo notturno. Il dialog aggiorna solo i campi non toccati.
  private reload(): void {
    this.service.list(this.utilityId).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento rilevazioni:', err),
    });
    this.service.summary(this.utilityId).subscribe({
      next: summary => {
        this.summary = summary;
        this.summaryChanged.emit(summary);
      },
      error: err => console.error('Errore caricamento riepilogo consumi:', err),
    });
  }
}
