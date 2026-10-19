import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../../../core/components/filterable-select.component';
import type {TOption} from '../../../core/types/option.interface';
import {toIsoDate} from '../../../core/helpers/date.helper';
import {ToastService} from '../../../core/services/toast.service';
import {SupplyService} from './supply.service';
import {SUPPLY_EVENT_LABEL, SupplyEvent, SupplyEventPayload, SupplyEventsList, SupplyEventType} from './supply.model';

export interface SupplyEventDialogData {
  utilityId: number;
  // null = nuovo cambiamento.
  event: SupplyEvent | null;
  // Soggetti terzi per l'intestatario della voltura.
  holderOptions: TOption[];
}

// 'AAAA-MM-GG' letto come giorno locale.
const toDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Nuovo cambiamento o modifica di una riga dello storico. Salva da sé: su un
// errore (400 con messaggio) resta aperto e lo mostra; chiuso con lo storico
// aggiornato.
@Component({
  selector: 'app-supply-event-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatDatepickerModule, FilterableSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.event ? 'Modifica cambiamento' : 'Nuovo cambiamento' }}</h2>
    <mat-dialog-content>
      @if (automatic) {
        <p class="sheet-hint">Riga gestita dal contratto immobiliare: si possono cambiare solo la data effettiva e le note.</p>
      }
      <form [formGroup]="form" class="supply-form">
        <mat-form-field class="span-2">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="type">
            @for (t of types; track t.value) {
              <mat-option [value]="t.value">{{ t.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (form.controls.type.value === 'TRANSFER') {
          <div class="span-2">
            <app-filterable-select label="Intestatario *" placeholder="Cerca soggetto..." [options]="data.holderOptions"
              formControlName="third_party_id_fk"
              [errorMessage]="form.controls.third_party_id_fk.invalid && form.controls.third_party_id_fk.touched ? 'Obbligatorio' : null">
            </app-filterable-select>
          </div>
        }
        <mat-form-field>
          <mat-label>Data richiesta</mat-label>
          <input matInput [matDatepicker]="requestedPicker" formControlName="requested_on">
          <mat-datepicker-toggle matSuffix [for]="requestedPicker"></mat-datepicker-toggle>
          <mat-datepicker #requestedPicker></mat-datepicker>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Data effettiva</mat-label>
          <input matInput [matDatepicker]="effectivePicker" formControlName="effective_on" [max]="today">
          <mat-datepicker-toggle matSuffix [for]="effectivePicker"></mat-datepicker-toggle>
          <mat-datepicker #effectivePicker></mat-datepicker>
          <mat-hint>Vuota = in sospeso</mat-hint>
        </mat-form-field>
        <mat-checkbox class="span-2" formControlName="date_unknown">Avvenuta, data non nota</mat-checkbox>
        <mat-form-field class="span-2">
          <mat-label>Note</mat-label>
          <textarea matInput rows="3" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" [disabled]="saving" (click)="save()">Salva</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .supply-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; padding-top: 0.5rem; }
    .span-2 { grid-column: span 2; }
    mat-checkbox.span-2 { margin-bottom: 12px; }
  `],
})
export class SupplyEventDialogComponent {
  protected data = inject<SupplyEventDialogData>(MAT_DIALOG_DATA);
  protected ref = inject(MatDialogRef<SupplyEventDialogComponent, SupplyEventsList | undefined>);
  private fb = inject(FormBuilder);
  private supply = inject(SupplyService);
  private toast = inject(ToastService);

  readonly automatic = this.data.event?.utilizer_grant_id_fk != null;
  readonly today = new Date();
  readonly types = (Object.keys(SUPPLY_EVENT_LABEL) as SupplyEventType[])
    .map(value => ({value, label: SUPPLY_EVENT_LABEL[value]}));
  saving = false;

  form = this.fb.group({
    type: [this.data.event?.type ?? ('TRANSFER' as SupplyEventType), Validators.required],
    third_party_id_fk: [this.data.event?.third_party_id_fk ?? null as number | null],
    requested_on: [toDate(this.data.event?.requested_on)],
    effective_on: [toDate(this.data.event?.effective_on)],
    date_unknown: [this.data.event?.date_unknown ?? false],
    notes: [this.data.event?.notes ?? ''],
  });

  constructor() {
    if (this.automatic) {
      for (const name of ['type', 'third_party_id_fk', 'requested_on', 'date_unknown'] as const) {
        this.form.controls[name].disable();
      }
    }
    this.syncDateUnknown();
    this.form.controls.date_unknown.valueChanges.subscribe(() => this.syncDateUnknown());
  }

  // Con «data non nota» la data effettiva non si indica.
  private syncDateUnknown(): void {
    const effective = this.form.controls.effective_on;
    if (this.form.controls.date_unknown.value) {
      effective.setValue(null);
      effective.disable({emitEvent: false});
    } else if (effective.disabled) {
      effective.enable({emitEvent: false});
    }
  }

  save(): void {
    const v = this.form.getRawValue();
    const holder = this.form.controls.third_party_id_fk;
    if (v.type === 'TRANSFER' && v.third_party_id_fk == null && !this.automatic) {
      holder.setErrors({required: true});
      holder.markAsTouched();
      return;
    }
    const iso = (d: Date | null) => (d ? toIsoDate(d) : null);
    const notes = v.notes?.trim() || null;
    // Riga automatica: solo i campi modificabili (il backend rifiuta gli altri).
    // «Data non nota» per tutti i tipi (anche volture e reintestazioni mai registrate).
    const payload: SupplyEventPayload = this.automatic
      ? {effective_on: iso(v.effective_on), notes}
      : {
        type: v.type as SupplyEventType,
        third_party_id_fk: v.type === 'TRANSFER' ? v.third_party_id_fk : null,
        requested_on: iso(v.requested_on),
        effective_on: v.date_unknown ? null : iso(v.effective_on),
        date_unknown: !!v.date_unknown,
        notes,
      };
    const req = this.data.event
      ? this.supply.update(this.data.event.id, payload)
      : this.supply.create({...payload, utility_id_fk: this.data.utilityId});
    this.saving = true;
    req.subscribe({
      next: list => this.ref.close(list),
      error: err => {
        this.saving = false;
        this.toast.add({severity: 'error', summary: 'Cambiamento non salvato', detail: errorText(err)});
      },
    });
  }
}

// Messaggio del 400 (anche come elenco della validazione).
export function errorText(err: {error?: {message?: string | string[]}} | null | undefined): string | undefined {
  const m = err?.error?.message;
  return Array.isArray(m) ? m.join(' ') : m;
}
