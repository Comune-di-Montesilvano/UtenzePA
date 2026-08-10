import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface MaintenanceManagerFilterValues {
  code: string | null;
  description: string | null;
}

@Component({
  selector: 'app-maintenance-manager-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca Gestori Manutenzione</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
          <mat-label>Codice Gestore</mat-label>
          <input matInput formControlName="code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 calc(50% - 0.5rem);">
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
export class MaintenanceManagerFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<MaintenanceManagerFilterDialogComponent, MaintenanceManagerFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<MaintenanceManagerFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    code: [this.data.values.code ?? ''],
    description: [this.data.values.description ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
