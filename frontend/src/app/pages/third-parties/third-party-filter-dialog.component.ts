import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {ThirdPartyType, TYPE_LABEL} from './third-party.model';
import {ContractKind, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';

interface ThirdPartyFilterValues {
  q: string | null;
  type: ThirdPartyType | null;
  kind: ContractKind | null;
}

@Component({
  selector: 'app-third-party-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri soggetti terzi</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome, P.IVA o codice fiscale</mat-label>
          <input matInput formControlName="q">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tipo soggetto</mat-label>
          <mat-select formControlName="type">
            <mat-option [value]="null">Tutti</mat-option>
            @for (t of types; track t) {
              <mat-option [value]="t">{{ typeLabel[t] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tipo contratto immobiliare</mat-label>
          <mat-select formControlName="kind">
            <mat-option [value]="null">Tutti</mat-option>
            @for (k of kinds; track k) {
              <mat-option [value]="k">{{ kindLabel[k] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica filtri</button>
    </mat-dialog-actions>
  `
})
export class ThirdPartyFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ThirdPartyFilterDialogComponent, ThirdPartyFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<ThirdPartyFilterValues>>(MAT_DIALOG_DATA);

  readonly types = Object.values(ThirdPartyType);
  readonly typeLabel = TYPE_LABEL;
  readonly kinds = Object.keys(KIND_LABEL) as ContractKind[];
  readonly kindLabel = KIND_LABEL;

  form = this.fb.group({
    q: [this.data.values.q ?? ''],
    type: [this.data.values.type ?? null as ThirdPartyType | null],
    kind: [this.data.values.kind ?? null as ContractKind | null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as ThirdPartyFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
