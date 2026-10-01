import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {HasRoleDirective} from '../../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {BudgetChapterSpending, BudgetChapterSpendingService, formatEuro} from './budget-chapter-spending.service';
import {SpendingEditDialogComponent, SpendingEditDialogData} from './spending-edit-dialog.component';

@Component({
  selector: 'app-budget-chapter-spending-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-weight: 600;">Spesa consuntiva per anno</span>
        <button mat-stroked-button type="button" (click)="openDialog()" [appHasRole]="['Admin','Operatore']">
          <mat-icon>add</mat-icon> Aggiungi anno
        </button>
      </div>
      @if (rows.length === 0) {
        <p style="color: #6b7280;">Nessuna spesa registrata.</p>
      } @else {
        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
          <thead>
            <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 6px;">Anno</th>
              <th style="padding: 6px; text-align: right;">Importo</th>
              <th style="padding: 6px; text-align: right;">Variazione</th>
              <th style="padding: 6px;">Note</th>
              <th style="padding: 6px;"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track row.id; let i = $index) {
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 6px;">{{ row.year }}</td>
                <td style="padding: 6px; text-align: right;">{{ formatEuro(row.amount) }}</td>
                <td style="padding: 6px; text-align: right;" [style.color]="deltaColor(i)">{{ delta(i) }}</td>
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
  `,
})
export class BudgetChapterSpendingTabComponent implements OnInit {
  private service = inject(BudgetChapterSpendingService);
  private dialog = inject(MatDialog);

  @Input({required: true}) chapterId!: number;

  readonly formatEuro = formatEuro;
  rows: BudgetChapterSpending[] = [];

  ngOnInit(): void {
    this.reload();
  }

  // Righe ordinate dall'anno più recente: confronto con la riga successiva,
  // solo se è davvero l'anno precedente.
  private previous(i: number): BudgetChapterSpending | null {
    const prev = this.rows[i + 1];
    return prev && prev.year === this.rows[i].year - 1 && Number(prev.amount) > 0 ? prev : null;
  }

  delta(i: number): string {
    const prev = this.previous(i);
    if (!prev) return '';
    const pct = ((Number(this.rows[i].amount) - Number(prev.amount)) / Number(prev.amount)) * 100;
    return `${pct > 0 ? '+' : ''}${pct.toLocaleString('it-IT', {maximumFractionDigits: 1})}%`;
  }

  deltaColor(i: number): string {
    const prev = this.previous(i);
    if (!prev) return 'inherit';
    return Number(this.rows[i].amount) > Number(prev.amount) ? '#b91c1c' : '#166534';
  }

  openDialog(item?: BudgetChapterSpending): void {
    this.dialog.open<SpendingEditDialogComponent, SpendingEditDialogData, boolean>(SpendingEditDialogComponent, {
      width: '480px',
      data: {chapterId: this.chapterId, item},
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }

  remove(row: BudgetChapterSpending): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina spesa', message: `Eliminare la spesa del ${row.year}?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(row.id).subscribe({
        next: () => this.reload(),
        error: err => console.error('Errore eliminazione spesa:', err),
      });
    });
  }

  private reload(): void {
    this.service.list(this.chapterId).subscribe({
      next: rows => this.rows = rows,
      error: err => console.error('Errore caricamento spesa storica:', err),
    });
  }
}
