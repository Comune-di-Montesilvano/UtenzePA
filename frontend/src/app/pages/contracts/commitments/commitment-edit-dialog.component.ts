import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterableSelectComponent} from '../../../core/components/filterable-select.component';
import type {TOption} from '../../../core/types/option.interface';
import {EntityNavigatorService} from '../../../core/services/entity-navigator.service';
import {chapterLabel, Commitment, CommitmentPayload} from './commitment.model';

export interface CommitmentDialogData {
  item: Commitment | null;
  chapterOptions: TOption[];
}

@Component({
  selector: 'app-commitment-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica impegno' : 'Nuovo impegno' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; padding-top: 0.5rem;">
        <div style="grid-column: span 2;">
          <app-filterable-select label="Capitolo *" placeholder="Cerca capitolo..." [options]="chapterOptions"
            formControlName="budget_chapter_id_fk" createLabel="Nuovo capitolo" (create)="newChapter()"
            [errorMessage]="form.controls.budget_chapter_id_fk.invalid && form.controls.budget_chapter_id_fk.touched ? 'Obbligatorio' : null">
          </app-filterable-select>
        </div>
        <mat-form-field>
          <mat-label>Esercizio</mat-label>
          <input matInput type="number" formControlName="fiscal_year">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Numero impegno</mat-label>
          <input matInput formControlName="commitment_number">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Importo impegnato (€)</mat-label>
          <input matInput type="number" step="0.01" formControlName="amount">
        </mat-form-field>
        <mat-form-field style="grid-column: span 2;">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" (click)="save()">Salva</button>
    </mat-dialog-actions>
  `,
})
export class CommitmentEditDialogComponent {
  protected data = inject<CommitmentDialogData>(MAT_DIALOG_DATA);
  protected ref = inject(MatDialogRef<CommitmentEditDialogComponent, CommitmentPayload | undefined>);
  private fb = inject(FormBuilder);
  private navigator = inject(EntityNavigatorService);
  chapterOptions: TOption[] = this.data.chapterOptions;

  form = this.fb.group({
    budget_chapter_id_fk: [this.data.item?.budget_chapter_id_fk ?? null as number | null, Validators.required],
    fiscal_year: [this.data.item?.fiscal_year ?? new Date().getFullYear(), [Validators.required, Validators.min(2000), Validators.max(2100)]],
    commitment_number: [this.data.item?.commitment_number ?? ''],
    amount: [this.data.item?.amount ?? null as number | null],
    notes: [this.data.item?.notes ?? ''],
  });

  newChapter(): void {
    this.navigator.createBudgetChapter().subscribe(c => {
      if (!c) return;
      const opt: TOption = {label: chapterLabel(c), value: c.id,
        searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`};
      // Anche nell'elenco del chiamante: il prossimo impegno lo propone già.
      this.data.chapterOptions.push(opt);
      this.data.chapterOptions.sort((a, b) => a.label.localeCompare(b.label));
      this.chapterOptions = [...this.data.chapterOptions];
      this.form.controls.budget_chapter_id_fk.setValue(c.id);
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({
      budget_chapter_id_fk: Number(v.budget_chapter_id_fk),
      fiscal_year: Number(v.fiscal_year),
      commitment_number: v.commitment_number?.trim() || null,
      amount: v.amount === null || `${v.amount}` === '' ? null : Number(v.amount),
      notes: v.notes?.trim() || null,
    });
  }
}
