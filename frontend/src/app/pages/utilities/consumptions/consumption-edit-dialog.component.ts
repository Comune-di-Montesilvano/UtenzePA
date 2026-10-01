import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {HttpErrorResponse} from '@angular/common/http';
import {ConsumptionKind, ConsumptionPayload, toIsoDate, UtilityConsumption} from './consumption.model';
import {UtilityConsumptionService} from './utility-consumption.service';

export interface ConsumptionEditDialogData {
  utilityId: number;
  meterNumber: string | null;
  item?: UtilityConsumption;
}

// Salva da sé (non delega al chiamante) per mostrare inline gli errori di
// validazione del backend (lettura decrescente, periodo sovrapposto, ...).
@Component({
  selector: 'app-consumption-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatButtonToggleModule, MatDatepickerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica rilevazione' : 'Nuova rilevazione' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem;">
        <mat-button-toggle-group formControlName="kind" aria-label="Tipo rilevazione" style="align-self: flex-start; margin-bottom: 0.5rem;">
          <mat-button-toggle value="READING">Lettura contatore</mat-button-toggle>
          <mat-button-toggle value="PERIOD">Consumo periodo</mat-button-toggle>
        </mat-button-toggle-group>

        @if (form.controls.kind.value === 'READING') {
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Data lettura *</mat-label>
              <input matInput [matDatepicker]="readingPicker" formControlName="reading_date" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="readingPicker"></mat-datepicker-toggle>
              <mat-datepicker #readingPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Valore contatore *</mat-label>
              <input matInput type="number" min="0" formControlName="reading_value">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Matricola contatore *</mat-label>
              <input matInput formControlName="meter_number">
              <mat-hint>Matricola diversa = nuovo contatore</mat-hint>
            </mat-form-field>
          </div>
        } @else {
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Dal *</mat-label>
              <input matInput [matDatepicker]="startPicker" formControlName="period_start" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Al *</mat-label>
              <input matInput [matDatepicker]="endPicker" formControlName="period_end" [max]="today">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 30%;">
              <mat-label>Consumo *</mat-label>
              <input matInput type="number" min="0" formControlName="consumption">
            </mat-form-field>
          </div>
        }

        <mat-form-field>
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>

        @if (error) {
          <p style="color: #b91c1c; margin: 0;">{{ error }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(false)">Annulla</button>
      <button mat-flat-button (click)="save()" [disabled]="!isValid() || saving">Salva</button>
    </mat-dialog-actions>
  `,
})
export class ConsumptionEditDialogComponent {
  private fb = inject(FormBuilder);
  private service = inject(UtilityConsumptionService);
  protected dialogRef = inject(MatDialogRef<ConsumptionEditDialogComponent, boolean>);
  protected data = inject<ConsumptionEditDialogData>(MAT_DIALOG_DATA);

  readonly today = new Date();
  error: string | null = null;
  saving = false;

  private toDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  form = this.fb.group({
    kind: [(this.data.item?.kind ?? 'READING') as ConsumptionKind, Validators.required],
    reading_date: [this.toDate(this.data.item?.reading_date) ?? (this.data.item ? null : new Date())],
    reading_value: [this.data.item?.reading_value ?? null as number | null],
    meter_number: [this.data.item?.meter_number ?? this.data.meterNumber ?? ''],
    period_start: [this.toDate(this.data.item?.period_start)],
    period_end: [this.toDate(this.data.item?.period_end)],
    consumption: [this.data.item?.consumption ?? null as number | null],
    notes: [this.data.item?.notes ?? ''],
  });

  isValid(): boolean {
    const v = this.form.getRawValue();
    if (v.kind === 'READING') {
      return !!v.reading_date && v.reading_value !== null && v.reading_value >= 0 && !!v.meter_number?.trim();
    }
    return !!v.period_start && !!v.period_end && v.consumption !== null && v.consumption >= 0;
  }

  save(): void {
    if (!this.isValid()) return;
    const v = this.form.getRawValue();
    const isReading = v.kind === 'READING';
    const payload: ConsumptionPayload = {
      kind: v.kind as ConsumptionKind,
      reading_date: isReading && v.reading_date ? toIsoDate(v.reading_date) : null,
      reading_value: isReading ? Number(v.reading_value) : null,
      meter_number: isReading ? (v.meter_number ?? '').trim() : null,
      period_start: !isReading && v.period_start ? toIsoDate(v.period_start) : null,
      period_end: !isReading && v.period_end ? toIsoDate(v.period_end) : null,
      consumption: !isReading ? Number(v.consumption) : null,
      notes: v.notes?.trim() ? v.notes.trim() : null,
    };
    this.saving = true;
    this.error = null;
    const request = this.data.item
      ? this.service.update(this.data.item.id, payload)
      : this.service.create(this.data.utilityId, payload);
    request.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }
}
