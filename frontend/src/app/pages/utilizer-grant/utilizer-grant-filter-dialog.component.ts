import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetService} from '../assets/asset.service';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';
import {
  ContractAlert,
  ContractDirection,
  ContractKind,
  DIRECTION_LABEL,
  DisplayStatus,
  KIND_LABEL,
  STATUS_LABEL,
} from './real-estate-contract.model';

export interface UtilizerGrantFilterValues {
  direction: ContractDirection | null;
  kind: ContractKind | null;
  computed_status: DisplayStatus | null;
  alert: ContractAlert | null;
  department: string | null;
  concession_act: string | null;
  utilities_to_be_taken_over: boolean | null;
  asset_id: number | null;
  party_id: number | null;
}

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map(value => ({value, label: labels[value]}));

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
    FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri contratti immobiliari</h2>
    <mat-dialog-content>
      <form id="filter-form" [formGroup]="form" (ngSubmit)="apply()"
            style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; padding-top: 0.5rem;">
        <mat-form-field>
          <mat-label>Avviso</mat-label>
          <mat-select formControlName="alert">
            <mat-option [value]="null">Nessuno</mat-option>
            <mat-option value="notice">Disdetta entro 60 giorni</mat-option>
            <mat-option value="expiring">In scadenza entro 4 mesi</mat-option>
            <mat-option value="expired_active">Scaduti ancora attivi</mat-option>
            <mat-option value="without_assets">Senza immobile</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Stato</mat-label>
          <mat-select formControlName="computed_status">
            <mat-option [value]="null">Tutti</mat-option>
            @for (o of statusOptions; track o.value) {
              <mat-option [value]="o.value">{{ o.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Direzione</mat-label>
          <mat-select formControlName="direction">
            <mat-option [value]="null">Tutte</mat-option>
            @for (o of directionOptions; track o.value) {
              <mat-option [value]="o.value">{{ o.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="kind">
            <mat-option [value]="null">Tutti</mat-option>
            @for (o of kindOptions; track o.value) {
              <mat-option [value]="o.value">{{ o.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <app-filterable-select
          label="Immobile"
          placeholder="Cerca immobile..."
          [options]="assetOptions"
          formControlName="asset_id">
        </app-filterable-select>
        <app-filterable-select
          label="Parte"
          placeholder="Cerca soggetto..."
          [options]="partyOptions"
          formControlName="party_id">
        </app-filterable-select>
        <mat-form-field>
          <mat-label>Settore</mat-label>
          <input matInput formControlName="department">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Atto</mat-label>
          <input matInput formControlName="concession_act">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Utenze da volturare</mat-label>
          <mat-select formControlName="utilities_to_be_taken_over">
            <mat-option [value]="null">Tutti</mat-option>
            <mat-option [value]="true">Sì</mat-option>
            <mat-option [value]="false">No</mat-option>
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
  private thirdPartiesService = inject(ThirdPartiesService);
  protected data = inject<FilterDialogData<UtilizerGrantFilterValues>>(MAT_DIALOG_DATA);

  readonly statusOptions = options(STATUS_LABEL);
  readonly directionOptions = options(DIRECTION_LABEL);
  readonly kindOptions = options(KIND_LABEL);
  assetOptions: TOption[] = [];
  partyOptions: TOption[] = [];

  form = this.fb.group({
    alert: [this.data.values.alert ?? null],
    computed_status: [this.data.values.computed_status ?? null],
    direction: [this.data.values.direction ?? null],
    kind: [this.data.values.kind ?? null],
    asset_id: [this.data.values.asset_id ?? null],
    party_id: [this.data.values.party_id ?? null],
    department: [this.data.values.department ?? ''],
    concession_act: [this.data.values.concession_act ?? ''],
    utilities_to_be_taken_over: [this.data.values.utilities_to_be_taken_over ?? null],
  });

  constructor() {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli immobili:', err),
    });
    this.thirdPartiesService.search({deleted: false, roles: `${PartyRole.LESSOR},${PartyRole.TENANT}`} as never).subscribe({
      next: (data) => {
        this.partyOptions = data
          .map(p => ({label: StringHelper.truncateAt(partyName(p), 50), value: p.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento delle controparti:', err),
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as UtilizerGrantFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
