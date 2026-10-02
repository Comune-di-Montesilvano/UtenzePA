import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {PlantService} from './plant.service';
import {
  formatDateIt,
  INSPECTION_LABEL,
  inspectionBadge,
  inspectionStatusOf,
  PlantInspection,
  PlantInspectionPayload,
  suggestedInspections,
} from './plant.model';
import type {PlantType} from './plant.model';
import {toIsoDate} from '../utilities/consumptions/consumption.model';

const toDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Scadenzario verifiche di un impianto (tab del dialog impianto).
@Component({
  selector: 'app-plant-inspections-tab',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule,
    MatAutocompleteModule, MatDatepickerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 0;">
      @if (!readOnly && !editing) {
        <div>
          <button mat-stroked-button type="button" (click)="startEdit()">
            <mat-icon>add</mat-icon> Aggiungi verifica
          </button>
        </div>
      }

      @if (editing) {
        <form [formGroup]="form" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 2 1 280px;">
              <mat-label>Verifica *</mat-label>
              <input matInput formControlName="kind" [matAutocomplete]="kindAuto">
              <mat-autocomplete #kindAuto="matAutocomplete" (optionSelected)="onSuggestion($event.option.value)">
                @for (s of suggestions; track s.kind) {
                  <mat-option [value]="s.kind">{{ s.kind }} ({{ s.period_months }} mesi)</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 140px;">
              <mat-label>Periodicità (mesi)</mat-label>
              <input matInput type="number" min="1" step="1" formControlName="period_months">
            </mat-form-field>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 1 1 180px;">
              <mat-label>Ultima verifica</mat-label>
              <input matInput [matDatepicker]="lastPicker" formControlName="last_date" placeholder="GG/MM/AAAA">
              <mat-datepicker-toggle matIconSuffix [for]="lastPicker"></mat-datepicker-toggle>
              <mat-datepicker #lastPicker></mat-datepicker>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 180px;">
              <mat-label>Prossima verifica</mat-label>
              <input matInput [matDatepicker]="nextPicker" formControlName="next_date" placeholder="GG/MM/AAAA">
              <mat-datepicker-toggle matIconSuffix [for]="nextPicker"></mat-datepicker-toggle>
              <mat-datepicker #nextPicker></mat-datepicker>
              <mat-hint>Se vuota: ultima + periodicità</mat-hint>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 200px;">
              <mat-label>Ente / ditta</mat-label>
              <input matInput formControlName="provider">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 160px;">
              <mat-label>Esito</mat-label>
              <input matInput formControlName="outcome">
            </mat-form-field>
          </div>
          <mat-form-field>
            <mat-label>Note</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
          @if (error) {
            <p style="color: #b91c1c; margin: 0;">{{ error }}</p>
          }
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button mat-stroked-button type="button" (click)="cancel()">Annulla</button>
            <button mat-flat-button type="button" (click)="save()" [disabled]="form.invalid || saving">Salva verifica</button>
          </div>
        </form>
      }

      @if (rows.length === 0) {
        <p style="color: #6A7282; margin: 0;">Nessuna verifica registrata.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 800px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Verifica</th>
                <th style="padding: 6px;">Periodicità</th>
                <th style="padding: 6px;">Ultima</th>
                <th style="padding: 6px;">Prossima</th>
                <th style="padding: 6px;">Stato</th>
                <th style="padding: 6px;">Ente / ditta</th>
                <th style="padding: 6px;">Esito</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.id) {
                @let b = badgeOf(r);
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">{{ r.kind }}</td>
                  <td style="padding: 6px;">{{ r.period_months ? r.period_months + ' mesi' : '' }}</td>
                  <td style="padding: 6px;">{{ dateIt(r.last_date) }}</td>
                  <td style="padding: 6px;">{{ dateIt(r.next_date) }}</td>
                  <td style="padding: 6px;">
                    <span [style.background]="b.bg" [style.color]="b.fg"
                          style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; white-space: nowrap;">{{ statusText(r) }}</span>
                  </td>
                  <td style="padding: 6px;">{{ r.provider ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.outcome ?? '' }}</td>
                  <td style="padding: 6px; white-space: nowrap; text-align: right;">
                    @if (!readOnly) {
                      <button mat-icon-button type="button" (click)="startEdit(r)" matTooltip="Modifica"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button type="button" (click)="remove(r)" matTooltip="Elimina"><mat-icon>delete</mat-icon></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class PlantInspectionsTabComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PlantService);

  @Input({required: true}) plantId!: number;
  @Input({required: true}) plantType!: PlantType;
  @Input() powerKw: number | null = null;
  @Input() readOnly = false;
  @Input() rows: PlantInspection[] = [];
  @Output() changed = new EventEmitter<void>();

  readonly dateIt = formatDateIt;
  suggestions: {kind: string; period_months: number}[] = [];
  editing = false;
  saving = false;
  error: string | null = null;
  private editId: number | null = null;

  form = this.fb.group({
    kind: ['', [Validators.required, Validators.maxLength(150)]],
    period_months: [null as number | null, Validators.min(1)],
    last_date: [null as Date | null],
    next_date: [null as Date | null],
    provider: [''],
    outcome: [''],
    notes: [''],
  });

  ngOnInit(): void {
    this.suggestions = suggestedInspections(this.plantType, this.powerKw);
  }

  badgeOf(r: PlantInspection): {bg: string; fg: string} {
    return inspectionBadge(inspectionStatusOf(r.next_date));
  }

  statusText(r: PlantInspection): string {
    return INSPECTION_LABEL[inspectionStatusOf(r.next_date)];
  }

  onSuggestion(kind: string): void {
    const s = this.suggestions.find(x => x.kind === kind);
    if (s && !this.form.controls.period_months.value) this.form.controls.period_months.setValue(s.period_months);
  }

  startEdit(r?: PlantInspection): void {
    this.editId = r?.id ?? null;
    this.error = null;
    this.form.reset({
      kind: r?.kind ?? '',
      period_months: r?.period_months ?? null,
      last_date: toDate(r?.last_date),
      next_date: toDate(r?.next_date),
      provider: r?.provider ?? '',
      outcome: r?.outcome ?? '',
      notes: r?.notes ?? '',
    });
    this.editing = true;
  }

  cancel(): void {
    this.editing = false;
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: Partial<PlantInspectionPayload> = {
      kind: (v.kind ?? '').trim(),
      period_months: v.period_months === null || `${v.period_months}` === '' ? null : Number(v.period_months),
      last_date: v.last_date ? toIsoDate(v.last_date) : null,
      provider: text(v.provider),
      outcome: text(v.outcome),
      notes: text(v.notes),
    };
    // Prossima vuota: la calcola il backend da ultima + periodicità.
    if (v.next_date) payload.next_date = toIsoDate(v.next_date);
    this.saving = true;
    this.error = null;
    const request = this.editId
      ? this.service.updateInspection(this.editId, payload)
      : this.service.addInspection(this.plantId, payload);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.editing = false;
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }

  remove(r: PlantInspection): void {
    if (!confirm(`Eliminare la verifica "${r.kind}"?`)) return;
    this.service.deleteInspection(r.id).subscribe({
      next: () => this.changed.emit(),
      error: err => console.error('Errore eliminazione verifica:', err),
    });
  }
}
