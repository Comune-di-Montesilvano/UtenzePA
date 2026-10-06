import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {BudgetChapterSpendingService, formatEuro} from './budget-chapter-spending.service';
import {SpendingEditDialogComponent, SpendingEditDialogData} from './spending-edit-dialog.component';
import {ChapterYear} from '../chapter-budget.model';

// Esercizi del capitolo: dati della ragioneria (inseriti) accanto a impegnato,
// fatturato e disponibile (calcolati). I dati li carica la scheda.
@Component({
  selector: 'app-budget-chapter-years-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="yt">
      @if (canEdit) {
        <button mat-stroked-button type="button" (click)="edit()"><mat-icon>add</mat-icon> Nuovo esercizio</button>
      }
      <table class="yt-table">
        <thead>
          <tr>
            <th>Esercizio</th>
            <th class="n">Stanz. iniziale</th>
            <th class="n">Assestato</th>
            <th class="n">Impegnato</th>
            <th class="n">Fatturato</th>
            <th class="n">Spesa ragioneria</th>
            <th class="n">Disponibile</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (y of years; track y.year) {
            <tr [class.over]="y.over_budget">
              <td>{{ y.year }}</td>
              <td class="n">{{ eur(y.initial_budget) }}</td>
              <td class="n">{{ eur(y.adjusted_budget) }}</td>
              <td class="n">
                {{ y.commitments ? eur(y.committed) : '' }}
                @if (y.commitments_without_amount) {
                  <div class="sub">{{ y.commitments_without_amount }} senza importo</div>
                }
              </td>
              <td class="n">
                {{ y.invoices ? eur(y.invoiced) : '' }}
                @if (y.invoices) {
                  <div class="sub">{{ y.invoices }} {{ y.invoices === 1 ? 'fattura' : 'fatture' }}</div>
                }
              </td>
              <td class="n">{{ eur(y.recorded_spending) }}</td>
              <td class="n">
                {{ eur(y.available) }}
                @if (y.available !== null && y.commitments_without_amount) {
                  <div class="sub">al massimo: impegnato parziale</div>
                }
              </td>
              <td>{{ y.notes ?? '' }}</td>
              <td class="actions">
                @if (canEdit) {
                  <button mat-icon-button type="button" (click)="edit(y)" matTooltip="Modifica"><mat-icon>edit</mat-icon></button>
                  @if (y.spending_id) {
                    <button mat-icon-button type="button" (click)="remove(y)" matTooltip="Elimina dati della ragioneria">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .yt { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 1rem 0; }
    .yt-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .yt-table th, .yt-table td { padding: 6px; border-bottom: 1px solid var(--sheet-border); text-align: left; vertical-align: top; }
    .yt-table .n { text-align: right; white-space: nowrap; }
    .yt-table tr.over td { background: var(--tone-danger-bg); }
    .sub { font-size: 0.75rem; color: var(--sheet-muted); }
    .actions { white-space: nowrap; text-align: right; }
  `],
})
export class BudgetChapterYearsTabComponent {
  private dialog = inject(MatDialog);
  private spending = inject(BudgetChapterSpendingService);

  @Input({required: true}) chapterId!: number;
  @Input() years: ChapterYear[] = [];
  @Input() canEdit = false;
  @Output() changed = new EventEmitter<void>();

  readonly eur = formatEuro;

  // Esercizio senza dati della ragioneria (solo impegni/fatture): si crea la riga dell'anno.
  edit(y?: ChapterYear): void {
    const item = y?.spending_id
      ? {
          id: y.spending_id,
          budget_chapter_id_fk: this.chapterId,
          year: y.year,
          amount: y.recorded_spending,
          initial_budget: y.initial_budget,
          adjusted_budget: y.adjusted_budget,
          notes: y.notes,
        }
      : undefined;
    this.dialog.open<SpendingEditDialogComponent, SpendingEditDialogData, boolean>(SpendingEditDialogComponent, {
      width: '520px',
      data: {chapterId: this.chapterId, item, year: y?.year},
    }).afterClosed().subscribe(saved => {
      if (saved) this.changed.emit();
    });
  }

  remove(y: ChapterYear): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Elimina dati dell’esercizio',
        message: `Eliminare stanziamenti e spesa ragioneria del ${y.year}? Impegni e fatture restano.`,
        confirmLabel: 'Elimina',
        danger: true,
      },
    }).afterClosed().subscribe(ok => {
      if (!ok || !y.spending_id) return;
      this.spending.delete(y.spending_id).subscribe({
        next: () => this.changed.emit(),
        error: err => console.error('Errore eliminazione esercizio:', err),
      });
    });
  }
}
