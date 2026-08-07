import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {SYSTEM_USER_ROLE_OPTIONS, SYSTEM_USER_STATUS_OPTIONS} from './system-user-edit-dialog.component';

export interface SystemUserFilterValues {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
}

@Component({
  selector: 'app-system-user-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="firstName">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Cognome</mat-label>
          <input matInput formControlName="lastName">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Ruolo</mat-label>
          <mat-select formControlName="role">
            @for (opt of roleOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Stato</mat-label>
          <mat-select formControlName="status">
            @for (opt of statusOptions; track opt.value) {
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
export class SystemUserFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SystemUserFilterDialogComponent, SystemUserFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<SystemUserFilterValues>>(MAT_DIALOG_DATA);

  roleOptions = SYSTEM_USER_ROLE_OPTIONS;
  statusOptions = SYSTEM_USER_STATUS_OPTIONS;

  form = this.fb.group({
    firstName: [this.data.values.firstName ?? ''],
    lastName: [this.data.values.lastName ?? ''],
    email: [this.data.values.email ?? ''],
    role: [this.data.values.role ?? null],
    status: [this.data.values.status ?? null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
