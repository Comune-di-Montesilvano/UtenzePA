import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface UtilizerFilterValues {
  name: string | null;
  description: string | null;
}

@Component({
  selector: 'app-utilizer-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri Avanzati Utilizzatore</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <mat-form-field>
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
export class UtilizerFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerFilterDialogComponent, UtilizerFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<UtilizerFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    name: [this.data.values.name ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
