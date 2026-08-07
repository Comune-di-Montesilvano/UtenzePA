import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {SupplyTypeOptions} from './enum/supply-type.enum';

export interface BudgetChapterFilterValues {
  chapter_code: string | null;
  article: string | null;
  pdc: string | null;
  description: string | null;
  supply_type: unknown;
}

@Component({
  selector: 'app-budget-chapter-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca Capitoli di Spesa</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Codice Capitolo</mat-label>
          <input matInput formControlName="chapter_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Articolo</mat-label>
          <input matInput formControlName="article">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>PDC</mat-label>
          <input matInput formControlName="pdc">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Tipo Fornitura</mat-label>
          <mat-select formControlName="supply_type">
            @for (opt of supplyTypeOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Descrizione</mat-label>
          <input matInput formControlName="description">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class BudgetChapterFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterFilterDialogComponent, BudgetChapterFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<BudgetChapterFilterValues>>(MAT_DIALOG_DATA);

  supplyTypeOptions = [
    {label: 'Tutti', value: null},
    ...SupplyTypeOptions
  ];

  form = this.fb.group({
    chapter_code: [this.data.values.chapter_code ?? ''],
    article: [this.data.values.article ?? ''],
    pdc: [this.data.values.pdc ?? ''],
    description: [this.data.values.description ?? ''],
    supply_type: [this.data.values.supply_type ?? null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
