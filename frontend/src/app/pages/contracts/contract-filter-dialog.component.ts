import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {TOption} from '../../core/types/option.interface';
import {SuppliersService} from '../suppliers/suppliers.service';

export interface ContractFilterValues {
  cig_contract: string | null;
  order_number: string | null;
  supplier_id_fk: number | null;
  supply_expiry_date_range: (string | null)[] | null;
}

@Component({
  selector: 'app-contract-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CIG</mat-label>
          <input matInput formControlName="cig_contract">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Numero Ordine</mat-label>
          <input matInput formControlName="order_number">
        </mat-form-field>
        <div style="flex: 1 1 45%;">
          <app-filterable-select label="Fornitore" placeholder="Cerca fornitore..." [options]="supplierOptions" formControlName="supplier_id_fk"></app-filterable-select>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class ContractFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractFilterDialogComponent, ContractFilterValues | 'clear'>);
  private suppliersService = inject(SuppliersService);
  protected data = inject<FilterDialogData<ContractFilterValues>>(MAT_DIALOG_DATA);

  supplierOptions: TOption[] = [];

  form = this.fb.group({
    cig_contract: [this.data.values.cig_contract ?? ''],
    order_number: [this.data.values.order_number ?? ''],
    supplier_id_fk: [this.data.values.supplier_id_fk ?? null],
    supply_expiry_date_range: [this.data.values.supply_expiry_date_range ?? null],
  });

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
