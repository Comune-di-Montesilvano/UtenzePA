import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

export interface SupplierFilterValues {
  supplier_id: string | null;
  company_name: string | null;
  vat_number: string | null;
  tax_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  email: string | null;
  pec: string | null;
}

@Component({
  selector: 'app-supplier-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>ID Fornitore</mat-label>
          <input matInput formControlName="supplier_id">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Ragione Sociale</mat-label>
          <input matInput formControlName="company_name">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Partita IVA</mat-label>
          <input matInput formControlName="vat_number">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Codice Fiscale</mat-label>
          <input matInput formControlName="tax_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Indirizzo</mat-label>
          <input matInput formControlName="address">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Città</mat-label>
          <input matInput formControlName="city">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CAP</mat-label>
          <input matInput formControlName="postal_code">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Email</mat-label>
          <input matInput formControlName="email">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>PEC</mat-label>
          <input matInput formControlName="pec">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class SupplierFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SupplierFilterDialogComponent, SupplierFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<SupplierFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({
    supplier_id: [this.data.values.supplier_id ?? ''],
    company_name: [this.data.values.company_name ?? ''],
    vat_number: [this.data.values.vat_number ?? ''],
    tax_code: [this.data.values.tax_code ?? ''],
    address: [this.data.values.address ?? ''],
    city: [this.data.values.city ?? ''],
    postal_code: [this.data.values.postal_code ?? ''],
    email: [this.data.values.email ?? ''],
    pec: [this.data.values.pec ?? ''],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
