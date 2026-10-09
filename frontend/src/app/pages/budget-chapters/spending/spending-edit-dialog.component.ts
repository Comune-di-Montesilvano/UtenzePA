import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {HttpErrorResponse} from '@angular/common/http';
import {BudgetChapterSpending, BudgetChapterSpendingService} from './budget-chapter-spending.service';

export interface SpendingEditDialogData {
  chapterId: number;
  item?: BudgetChapterSpending;
  // Anno proposto per una riga nuova (es. esercizio con soli impegni/fatture).
  year?: number;
}

const AMOUNTS = ['initial_budget', 'adjusted_budget', 'amount'] as const;
const isSet = (v: unknown): boolean => v !== null && v !== undefined && v !== '';

// Almeno un importo (stessa regola del backend).
function someAmount(group: AbstractControl): ValidationErrors | null {
  const v = group.value as Record<string, unknown>;
  return AMOUNTS.some(k => isSet(v[k])) ? null : {noAmount: true};
}

// Salva da sé per mostrare inline l'errore "anno già presente" del backend.
@Component({
  selector: 'app-spending-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica esercizio ' + data.item.year : 'Nuovo esercizio' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem; padding-top: 0.5rem;">
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Esercizio</mat-label>
          <input matInput type="number" min="1990" max="2100" formControlName="year">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Stanziamento iniziale (€)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="initial_budget">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Assestato (€)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="adjusted_budget">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Spesa ragioneria (€)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amount">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
        @if (form.hasError('noAmount') && form.touched) {
          <p style="color: var(--app-error); margin: 0;">Indicare almeno un importo.</p>
        }
        @if (error) {
          <p style="color: var(--app-error); margin: 0;">{{ error }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(false)">Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="saving">Salva</button>
    </mat-dialog-actions>
  `,
})
export class SpendingEditDialogComponent {
  private fb = inject(FormBuilder);
  private service = inject(BudgetChapterSpendingService);
  protected dialogRef = inject(MatDialogRef<SpendingEditDialogComponent, boolean>);
  protected data = inject<SpendingEditDialogData>(MAT_DIALOG_DATA);

  error: string | null = null;
  saving = false;

  form = this.fb.group({
    year: [this.data.item?.year ?? this.data.year ?? new Date().getFullYear(),
      [Validators.required, Validators.min(1990), Validators.max(2100)]],
    initial_budget: [this.data.item?.initial_budget ?? null as number | null, Validators.min(0)],
    adjusted_budget: [this.data.item?.adjusted_budget ?? null as number | null, Validators.min(0)],
    amount: [this.data.item?.amount ?? null as number | null, Validators.min(0)],
    notes: [this.data.item?.notes ?? ''],
  }, {validators: someAmount});

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const n = (x: unknown): number | null => (isSet(x) ? Number(x) : null);
    const payload = {
      year: Number(v.year),
      initial_budget: n(v.initial_budget),
      adjusted_budget: n(v.adjusted_budget),
      amount: n(v.amount),
      notes: v.notes?.trim() ? v.notes.trim() : null,
    };
    this.saving = true;
    this.error = null;
    const request = this.data.item
      ? this.service.update(this.data.item.id, payload)
      : this.service.create(this.data.chapterId, payload);
    request.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }
}
