import {Component, inject} from '@angular/core';
import {FormBuilder, FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {SuppliersService} from '../suppliers/suppliers.service';
import {TOption} from '../../core/types/option.interface';

export interface ConsipAgreementFilterValues {
  name: string | null;
  supplier_id: number | null;
  description: string | null;
  cig_master: string | null;
  expiration_date_range: (Date | null)[] | null;
  safeguard: boolean | null;
}

@Component({
  selector: 'app-consip-agreement-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    FilterableSelectComponent
  ],
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CIG Master</mat-label>
          <input matInput formControlName="cig_master">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Descrizione</mat-label>
          <input matInput formControlName="description">
        </mat-form-field>

        <mat-form-field style="flex: 1 1 100%;">
          <mat-label>Data scadenza</mat-label>
          <mat-date-range-input [formGroup]="dateRangeGroup" [rangePicker]="expirationRangePicker">
            <input matStartDate formControlName="start" placeholder="Data inizio">
            <input matEndDate formControlName="end" placeholder="Data fine">
          </mat-date-range-input>
          <mat-datepicker-toggle matSuffix [for]="expirationRangePicker"></mat-datepicker-toggle>
          <mat-date-range-picker #expirationRangePicker></mat-date-range-picker>
        </mat-form-field>

        <div style="flex: 1 1 100%;">
          <app-filterable-select
            label="Fornitore"
            placeholder="Cerca fornitore..."
            [options]="supplierOptions"
            formControlName="supplier_id">
          </app-filterable-select>
        </div>

        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Salvaguardia</mat-label>
          <mat-select formControlName="safeguard">
            @for (opt of safeguardOptions; track opt.label) {
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
export class ConsipAgreementFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ConsipAgreementFilterDialogComponent, ConsipAgreementFilterValues | 'clear'>);
  private supplierService = inject(SuppliersService);
  protected data = inject<FilterDialogData<ConsipAgreementFilterValues>>(MAT_DIALOG_DATA);

  supplierOptions: TOption[] = [];

  safeguardOptions: { label: string; value: boolean | null }[] = [
    {label: 'Tutti', value: null},
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    name: [this.data.values.name ?? ''],
    supplier_id: [this.data.values.supplier_id ?? null],
    description: [this.data.values.description ?? ''],
    cig_master: [this.data.values.cig_master ?? ''],
    safeguard: [this.data.values.safeguard ?? null],
  });

  dateRangeGroup = new FormGroup({
    start: new FormControl<Date | null>(this.data.values.expiration_date_range?.[0] ?? null),
    end: new FormControl<Date | null>(this.data.values.expiration_date_range?.[1] ?? null),
  });

  constructor() {
    this.supplierService.search({deleted: false}).subscribe({
      next: (data) => {
        this.supplierOptions = data
          .map(s => ({label: s.company_name, value: s.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  apply(): void {
    const raw = this.form.getRawValue();
    const result: ConsipAgreementFilterValues = {
      ...raw,
      expiration_date_range: [
        this.dateRangeGroup.value.start ?? null,
        this.dateRangeGroup.value.end ?? null,
      ],
    };
    this.dialogRef.close(result);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
