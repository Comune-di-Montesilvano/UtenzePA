import {Component, inject} from '@angular/core';
import {FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';

export interface PurposeFilterDialogData {
  form: FormGroup;
  useTypeOptions: { label: string; value: unknown }[];
}

@Component({
  selector: 'app-purpose-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="data.form" id="filter-form" (ngSubmit)="apply()" style="display: flex; gap: 1rem;">
        <mat-form-field style="flex: 1 1 50%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 50%;">
          <mat-label>Tipo uso</mat-label>
          <mat-select formControlName="use_type">
            @for (opt of data.useTypeOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class PurposeFilterDialogComponent {
  protected data = inject<PurposeFilterDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<PurposeFilterDialogComponent, boolean>);

  apply(): void {
    this.dialogRef.close(true);
  }

  clear(): void {
    this.data.form.reset();
    this.dialogRef.close(true);
  }
}
