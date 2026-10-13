import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, Output} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {PlantService} from './plant.service';
import {
  Badge,
  FIRE_EQUIPMENT_LABEL,
  FIRE_EQUIPMENT_PLURAL,
  FireEquipmentType,
  fireEquipmentStatusOf,
  INSPECTION_LABEL,
  inspectionBadge,
  isoToMonthText,
  MONTH_TEXT_PATTERN,
  monthTextToIso,
  PlantFireEquipment,
  PlantFireEquipmentPayload,
} from './plant.model';

// Presidi di un impianto antincendio: estintori (uno per riga, con scadenze
// in mese/anno), idranti, naspi, attacchi VVF, rivelazione e allarme (contati).
@Component({
  selector: 'app-plant-fire-equipment-tab',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule,
    MatSelectModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 0;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        @if (!readOnly && !editing) {
          <button mat-stroked-button type="button" (click)="startEdit()">
            <mat-icon>add</mat-icon> Aggiungi presidio
          </button>
        }
        <span style="color: var(--app-muted); font-size: 0.85rem;">{{ totals() }}</span>
      </div>

      @if (editing) {
        <form [formGroup]="form" style="border: 1px solid var(--app-border); border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 1 1 220px;">
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="equipment_type">
                @for (t of types; track t) {
                  <mat-option [value]="t">{{ label[t] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field style="flex: 0 1 110px;">
              <mat-label>Quantità</mat-label>
              <input matInput type="number" min="1" step="1" formControlName="quantity">
              <mat-error>Almeno 1</mat-error>
            </mat-form-field>
            <!-- Per tutti i tipi: idranti e naspi hanno la capacità (es. UNI 45). -->
            <mat-form-field style="flex: 1 1 160px;">
              <mat-label>Matricola</mat-label>
              <input matInput formControlName="serial_number">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 140px;">
              <mat-label>Agente estinguente</mat-label>
              <input matInput formControlName="agent" placeholder="es. polvere, CO2">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 120px;">
              <mat-label>Capacità</mat-label>
              <input matInput formControlName="capacity" placeholder="es. 6 kg, UNI 45">
            </mat-form-field>
          </div>
          @if (isExtinguisher) {
            <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
              <mat-form-field style="flex: 1 1 160px;">
                <mat-label>Ultimo controllo</mat-label>
                <input matInput formControlName="last_check_on" placeholder="mm/aaaa">
                <mat-hint>Controllo semestrale</mat-hint>
                <mat-error>Formato mm/aaaa</mat-error>
              </mat-form-field>
              <mat-form-field style="flex: 1 1 160px;">
                <mat-label>Scadenza revisione</mat-label>
                <input matInput formControlName="revision_due_on" placeholder="mm/aaaa">
                <mat-error>Formato mm/aaaa</mat-error>
              </mat-form-field>
              <mat-form-field style="flex: 1 1 160px;">
                <mat-label>Scadenza collaudo</mat-label>
                <input matInput formControlName="test_due_on" placeholder="mm/aaaa">
                <mat-error>Formato mm/aaaa</mat-error>
              </mat-form-field>
            </div>
          }
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 1 1 240px;">
              <mat-label>Ubicazione</mat-label>
              <input matInput formControlName="location" placeholder="es. piano terra, corridoio">
            </mat-form-field>
            <mat-form-field style="flex: 2 1 240px;">
              <mat-label>Note</mat-label>
              <input matInput formControlName="notes">
            </mat-form-field>
          </div>
          @if (error) {
            <p style="color: var(--app-error); margin: 0;">{{ error }}</p>
          }
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button mat-stroked-button type="button" (click)="editing = false">Annulla</button>
            <button mat-flat-button type="button" (click)="save()" [disabled]="saving">Salva presidio</button>
          </div>
        </form>
      }

      @if (rows.length === 0) {
        <p style="color: light-dark(#6a7282, #9a9aa3); margin: 0;">Nessun presidio censito.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 1000px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid var(--app-border);">
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Q.tà</th>
                <th style="padding: 6px;">Matricola</th>
                <th style="padding: 6px;">Agente</th>
                <th style="padding: 6px;">Capacità</th>
                <th style="padding: 6px;">Ubicazione</th>
                <th style="padding: 6px;">Controllo</th>
                <th style="padding: 6px;">Revisione</th>
                <th style="padding: 6px;">Collaudo</th>
                <th style="padding: 6px;">Stato</th>
                <th style="padding: 6px;">Note</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.id) {
                <tr style="border-bottom: 1px solid var(--app-surface-2);">
                  <td style="padding: 6px;">{{ typeText(r) }}</td>
                  <td style="padding: 6px;">{{ r.quantity ?? 1 }}</td>
                  <td style="padding: 6px;">{{ r.serial_number ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.agent ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.capacity ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.location ?? '' }}</td>
                  <td style="padding: 6px;">{{ monthText(r.last_check_on) }}</td>
                  <td style="padding: 6px;">{{ monthText(r.revision_due_on) }}</td>
                  <td style="padding: 6px;">{{ monthText(r.test_due_on) }}</td>
                  <td style="padding: 6px;">
                    @if (statusOf(r); as s) {
                      @let b = badge(s.status);
                      <span [matTooltip]="s.reason" [style.background]="b.bg" [style.color]="b.fg"
                            style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; white-space: nowrap;">{{ statusLabel[s.status] }}</span>
                    }
                  </td>
                  <td style="padding: 6px;">{{ r.notes ?? '' }}</td>
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
export class PlantFireEquipmentTabComponent {
  private fb = inject(FormBuilder);
  private service = inject(PlantService);

  @Input({required: true}) plantId!: number;
  @Input() readOnly = false;
  @Input() rows: PlantFireEquipment[] = [];
  @Output() changed = new EventEmitter<void>();

  readonly types = Object.keys(FIRE_EQUIPMENT_LABEL) as FireEquipmentType[];
  readonly label = FIRE_EQUIPMENT_LABEL;
  readonly statusLabel = INSPECTION_LABEL;
  editing = false;
  saving = false;
  error: string | null = null;
  private editId: number | null = null;

  form = this.fb.group({
    equipment_type: ['EXTINGUISHER' as FireEquipmentType, Validators.required],
    quantity: [1 as number | null, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    serial_number: [''],
    agent: [''],
    capacity: [''],
    location: [''],
    last_check_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    revision_due_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    test_due_on: ['', Validators.pattern(MONTH_TEXT_PATTERN)],
    notes: [''],
  });

  get isExtinguisher(): boolean {
    return this.form.controls.equipment_type.value === 'EXTINGUISHER';
  }

  typeText(r: PlantFireEquipment): string {
    return FIRE_EQUIPMENT_LABEL[r.equipment_type];
  }

  monthText(iso: string | null): string {
    return isoToMonthText(iso);
  }

  statusOf(r: PlantFireEquipment) {
    return fireEquipmentStatusOf(r);
  }

  badge(s: Parameters<typeof inspectionBadge>[0]): Badge {
    return inspectionBadge(s);
  }

  // Es. "12 estintori · 8 rivelatori di fumo": somma delle quantità.
  totals(): string {
    return this.types
      .map(t => ({t, n: this.rows.filter(r => r.equipment_type === t).reduce((sum, r) => sum + (r.quantity ?? 1), 0)}))
      .filter(x => x.n > 0)
      .map(x => `${x.n} ${FIRE_EQUIPMENT_PLURAL[x.t][x.n === 1 ? 0 : 1]}`)
      .join(' · ');
  }

  startEdit(r?: PlantFireEquipment): void {
    this.editId = r?.id ?? null;
    this.error = null;
    this.form.reset({
      equipment_type: r?.equipment_type ?? 'EXTINGUISHER',
      quantity: r?.quantity ?? 1,
      serial_number: r?.serial_number ?? '',
      agent: r?.agent ?? '',
      capacity: r?.capacity ?? '',
      location: r?.location ?? '',
      last_check_on: isoToMonthText(r?.last_check_on),
      revision_due_on: isoToMonthText(r?.revision_due_on),
      test_due_on: isoToMonthText(r?.test_due_on),
      notes: r?.notes ?? '',
    });
    this.editing = true;
  }

  save(): void {
    // Le date contano solo per gli estintori: per gli altri tipi non bloccano.
    const extinguisher = this.isExtinguisher;
    const dateControls = [this.form.controls.last_check_on, this.form.controls.revision_due_on, this.form.controls.test_due_on];
    const invalid = this.form.controls.equipment_type.invalid || this.form.controls.quantity.invalid
      || (extinguisher && dateControls.some(c => c.invalid));
    if (invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: Partial<PlantFireEquipmentPayload> = {
      equipment_type: v.equipment_type as FireEquipmentType,
      quantity: Number(v.quantity),
      serial_number: text(v.serial_number),
      agent: text(v.agent),
      capacity: text(v.capacity),
      location: text(v.location),
      last_check_on: extinguisher ? monthTextToIso(v.last_check_on) : null,
      revision_due_on: extinguisher ? monthTextToIso(v.revision_due_on) : null,
      test_due_on: extinguisher ? monthTextToIso(v.test_due_on) : null,
      notes: text(v.notes),
    };
    this.saving = true;
    this.error = null;
    const request = this.editId
      ? this.service.updateFireEquipment(this.editId, payload)
      : this.service.addFireEquipment(this.plantId, payload);
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

  remove(r: PlantFireEquipment): void {
    if (!confirm(`Eliminare il presidio ${this.typeText(r)} ${r.serial_number ?? ''}?`)) return;
    this.service.deleteFireEquipment(r.id).subscribe({
      next: () => this.changed.emit(),
      error: err => console.error('Errore eliminazione presidio:', err),
    });
  }
}
