import {Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetService} from '../assets/asset.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';

export interface UtilizerGrantFilterValues {
  concession_act: string | null;
  usage_type: string | null;
  utilities_to_be_taken_over: boolean | null;
  grant_date: Date | null;
  expire_date: Date | null;
  asset_id_fk: number | null;
  utilizer_id_fk: number | null;
}

@Component({
  selector: 'app-utilizer-grant-filter-dialog',
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
    <h2 mat-dialog-title>Filtri Avanzati Concessioni</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <app-filterable-select
          label="Immobile"
          placeholder="Cerca immobile..."
          [options]="assetOptions"
          formControlName="asset_id_fk">
        </app-filterable-select>

        <app-filterable-select
          label="Utilizzatore"
          placeholder="Cerca utilizzatore..."
          [options]="utilizerOptions"
          formControlName="utilizer_id_fk">
        </app-filterable-select>

        <mat-form-field>
          <mat-label>Tipo Utilizzo</mat-label>
          <input matInput formControlName="usage_type">
        </mat-form-field>

        <mat-form-field>
          <mat-label>Atto di Concessione</mat-label>
          <input matInput formControlName="concession_act">
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data Concessione</mat-label>
          <input matInput [matDatepicker]="grantPicker" formControlName="grant_date" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matSuffix [for]="grantPicker"></mat-datepicker-toggle>
          <mat-datepicker #grantPicker></mat-datepicker>
          @if (form.controls.grant_date.hasError('matDatepickerParse')) {
            <mat-error>Data non valida (GG/MM/AAAA)</mat-error>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Data Scadenza</mat-label>
          <input matInput [matDatepicker]="expirePicker" formControlName="expire_date" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matSuffix [for]="expirePicker"></mat-datepicker-toggle>
          <mat-datepicker #expirePicker></mat-datepicker>
          @if (form.controls.expire_date.hasError('matDatepickerParse')) {
            <mat-error>Data non valida (GG/MM/AAAA)</mat-error>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Utenze da volturare</mat-label>
          <mat-select formControlName="utilities_to_be_taken_over">
            @for (opt of utilitiesOptions; track opt.label) {
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
export class UtilizerGrantFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerGrantFilterDialogComponent, UtilizerGrantFilterValues | 'clear'>);
  private assetService = inject(AssetService);
  private utilizerService = inject(UtilizerService);
  protected data = inject<FilterDialogData<UtilizerGrantFilterValues>>(MAT_DIALOG_DATA);

  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];

  utilitiesOptions: { label: string; value: boolean | null }[] = [
    {label: 'Tutti', value: null},
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    concession_act: [this.data.values.concession_act ?? ''],
    usage_type: [this.data.values.usage_type ?? ''],
    utilities_to_be_taken_over: [this.data.values.utilities_to_be_taken_over ?? null],
    grant_date: [this.data.values.grant_date ?? null],
    expire_date: [this.data.values.expire_date ?? null],
    asset_id_fk: [this.data.values.asset_id_fk ?? null],
    utilizer_id_fk: [this.data.values.utilizer_id_fk ?? null],
  });

  constructor() {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Asset:', err),
    });
    this.utilizerService.search({deleted: false}).subscribe({
      next: (data) => {
        this.utilizerOptions = data
          .map(u => ({label: StringHelper.truncateAt(u.name, 50), value: u.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Utilizzatori:', err),
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as UtilizerGrantFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
