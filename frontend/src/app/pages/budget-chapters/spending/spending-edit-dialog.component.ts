import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {HttpErrorResponse} from '@angular/common/http';
import {BudgetChapterSpending, BudgetChapterSpendingService} from './budget-chapter-spending.service';

export interface SpendingEditDialogData {
  chapterId: number;
  item?: BudgetChapterSpending;
}

// Salva da sé per mostrare inline l'errore "anno già presente" del backend.
@Component({
  selector: 'app-spending-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica spesa' : 'Nuova spesa annua' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: flex; flex-wrap: wrap; gap: 1rem; padding-top: 0.5rem;">
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Anno *</mat-label>
          <input matInput type="number" min="1990" max="2100" formControlName="year">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 40%;">
          <mat-label>Importo speso (€) *</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amount">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
        @if (error) {
          <p style="color: #b91c1c; margin: 0;">{{ error }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(false)">Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || saving">Salva</button>
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
    year: [this.data.item?.year ?? new Date().getFullYear() - 1, [Validators.required, Validators.min(1990), Validators.max(2100)]],
    amount: [this.data.item?.amount ?? null as number | null, [Validators.required, Validators.min(0)]],
    notes: [this.data.item?.notes ?? ''],
  });

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const payload = {
      year: Number(v.year),
      amount: Number(v.amount),
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
