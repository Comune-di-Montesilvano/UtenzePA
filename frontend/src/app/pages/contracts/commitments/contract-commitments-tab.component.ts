import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {forkJoin} from 'rxjs';
import {CommitmentService} from './commitment.service';
import {chapterLabel, Commitment} from './commitment.model';
import {CommitmentDialogData, CommitmentEditDialogComponent} from './commitment-edit-dialog.component';
import {SpendingService} from '../../spending/spending.service';
import type {ChapterSummary} from '../../spending/spending.model';
import type {TOption} from '../../../core/types/option.interface';
import {ToastService} from '../../../core/services/toast.service';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';

const eur = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Tab "Impegni e capitoli" della scheda contratto di fornitura: riepilogo per
// capitolo (calcolato) ed elenco degli impegni censiti.
@Component({
  selector: 'app-contract-commitments-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h3 class="sheet-section-title">Capitoli</h3>
    @if (!summary.length) {
      <p class="sheet-empty">Nessuna utenza attiva né impegno su questo contratto.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Capitolo</th><th>Utenze attive</th><th>Impegnato</th><th>Speso da fatture</th></tr></thead>
        <tbody>
          @for (row of summary; track row.budget_chapter_id) {
            <tr [class.row-warning]="uncommitted(row)">
              <td>
                {{ label(row) }}
                @if (uncommitted(row)) {
                  <mat-icon class="inline-icon" matTooltip="Capitolo delle utenze senza impegno sul contratto">warning</mat-icon>
                }
              </td>
              <td>{{ row.utilities }}</td>
              <td>{{ committedText(row) }}</td>
              <td>{{ spentText(row) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }

    <div style="display: flex; align-items: center; margin-top: 20px;">
      <h3 class="sheet-section-title" style="margin: 0;">Impegni</h3>
      @if (canEdit) {
        <button mat-stroked-button type="button" style="margin-left: auto;" (click)="edit(null)">
          <mat-icon>add</mat-icon> Nuovo impegno
        </button>
      }
    </div>
    @if (!commitments.length) {
      <p class="sheet-empty">Nessun impegno censito.</p>
    } @else {
      <table class="sheet-table">
        <thead>
          <tr>
            <th>Esercizio</th><th>Capitolo</th><th>Numero</th><th>Importo</th><th>Note</th>
            @if (canEdit) { <th></th> }
          </tr>
        </thead>
        <tbody>
          @for (c of commitments; track c.id) {
            <tr>
              <td>{{ c.fiscal_year }}</td>
              <td>{{ chapterLabel(c.budgetChapter) }}</td>
              <td>{{ c.commitment_number || '—' }}</td>
              <td>{{ eur(c.amount) }}</td>
              <td>{{ c.notes || '' }}</td>
              @if (canEdit) {
                <td style="white-space: nowrap; text-align: right;">
                  <button mat-icon-button type="button" aria-label="Modifica impegno" (click)="edit(c)"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button type="button" aria-label="Elimina impegno" (click)="remove(c)"><mat-icon>delete</mat-icon></button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ContractCommitmentsTabComponent implements OnInit {
  @Input({required: true}) contractId!: number;
  @Input() canEdit = false;
  @Input() chapterOptions: TOption[] = [];
  @Output() changed = new EventEmitter<number>();

  private commitmentService = inject(CommitmentService);
  private spending = inject(SpendingService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  commitments: Commitment[] = [];
  summary: ChapterSummary[] = [];
  readonly chapterLabel = chapterLabel;
  readonly eur = eur;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin([this.commitmentService.list(this.contractId), this.spending.contractChapters(this.contractId)])
      .subscribe(([commitments, summary]) => {
        this.commitments = commitments;
        this.summary = summary;
        this.changed.emit(commitments.length);
      });
  }

  label(row: ChapterSummary): string {
    return chapterLabel(row);
  }

  // Capitolo delle utenze del contratto senza alcun impegno censito.
  uncommitted(row: ChapterSummary): boolean {
    return row.budget_chapter_id !== null && row.utilities > 0 && !row.committed.length;
  }

  committedText(row: ChapterSummary): string {
    return row.committed.length
      ? row.committed.map(c => `${c.year}${c.amount !== null ? ': ' + eur(c.amount) : ''}`).join(' · ')
      : '—';
  }

  spentText(row: ChapterSummary): string {
    return row.spent.length ? row.spent.map(s => `${s.year}: ${eur(s.total)}`).join(' · ') : '—';
  }

  edit(item: Commitment | null): void {
    this.dialog.open<CommitmentEditDialogComponent, CommitmentDialogData>(CommitmentEditDialogComponent, {
      width: '560px', maxWidth: '95vw', data: {item, chapterOptions: this.chapterOptions},
    }).afterClosed().subscribe(payload => {
      if (!payload) return;
      const req = item ? this.commitmentService.update(item.id, payload) : this.commitmentService.create(this.contractId, payload);
      req.subscribe({
        next: () => this.load(),
        error: err => this.toast.add({severity: 'error', summary: 'Impegno non salvato', detail: err?.error?.message}),
      });
    });
  }

  remove(item: Commitment): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData>(ConfirmDialogComponent, {
      data: {
        title: 'Elimina impegno',
        message: `Eliminare l'impegno ${item.fiscal_year} sul capitolo ${chapterLabel(item.budgetChapter)}?`,
        confirmLabel: 'Elimina',
        danger: true,
      },
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.commitmentService.delete(item.id).subscribe({
        next: () => this.load(),
        error: err => this.toast.add({severity: 'error', summary: 'Impegno non eliminato', detail: err?.error?.message}),
      });
    });
  }
}
