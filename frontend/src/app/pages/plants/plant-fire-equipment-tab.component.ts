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
import {FIRE_EQUIPMENT_LABEL, FireEquipmentType, PlantFireEquipment, PlantFireEquipmentPayload} from './plant.model';

// Presidi di un impianto antincendio (estintori, idranti, naspi, attacchi VVF).
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
        <span style="color: #6b7280; font-size: 0.85rem;">{{ totals() }}</span>
      </div>

      @if (editing) {
        <form [formGroup]="form" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 1 1 180px;">
              <mat-label>Tipo *</mat-label>
              <mat-select formControlName="equipment_type">
                @for (t of types; track t) {
                  <mat-option [value]="t">{{ label[t] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
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
              <input matInput formControlName="capacity" placeholder="es. 6 kg">
            </mat-form-field>
          </div>
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
            <p style="color: #b91c1c; margin: 0;">{{ error }}</p>
          }
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button mat-stroked-button type="button" (click)="editing = false">Annulla</button>
            <button mat-flat-button type="button" (click)="save()" [disabled]="form.invalid || saving">Salva presidio</button>
          </div>
        </form>
      }

      @if (rows.length === 0) {
        <p style="color: #6A7282; margin: 0;">Nessun presidio censito.</p>
      } @else {
        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 750px; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 6px;">Tipo</th>
                <th style="padding: 6px;">Matricola</th>
                <th style="padding: 6px;">Agente</th>
                <th style="padding: 6px;">Capacità</th>
                <th style="padding: 6px;">Ubicazione</th>
                <th style="padding: 6px;">Note</th>
                <th style="padding: 6px;"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.id) {
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 6px;">{{ typeText(r) }}</td>
                  <td style="padding: 6px;">{{ r.serial_number ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.agent ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.capacity ?? '' }}</td>
                  <td style="padding: 6px;">{{ r.location ?? '' }}</td>
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
  editing = false;
  saving = false;
  error: string | null = null;
  private editId: number | null = null;

  form = this.fb.group({
    equipment_type: ['EXTINGUISHER' as FireEquipmentType, Validators.required],
    serial_number: [''],
    agent: [''],
    capacity: [''],
    location: [''],
    notes: [''],
  });

  typeText(r: PlantFireEquipment): string {
    return FIRE_EQUIPMENT_LABEL[r.equipment_type];
  }

  // Es. "12 estintori · 3 idranti".
  totals(): string {
    const plural: Record<FireEquipmentType, [string, string]> = {
      EXTINGUISHER: ['estintore', 'estintori'],
      HYDRANT: ['idrante', 'idranti'],
      HOSE_REEL: ['naspo', 'naspi'],
      FIRE_BRIGADE_CONNECTION: ['attacco VVF', 'attacchi VVF'],
    };
    return this.types
      .map(t => ({t, n: this.rows.filter(r => r.equipment_type === t).length}))
      .filter(x => x.n > 0)
      .map(x => `${x.n} ${plural[x.t][x.n === 1 ? 0 : 1]}`)
      .join(' · ');
  }

  startEdit(r?: PlantFireEquipment): void {
    this.editId = r?.id ?? null;
    this.error = null;
    this.form.reset({
      equipment_type: r?.equipment_type ?? 'EXTINGUISHER',
      serial_number: r?.serial_number ?? '',
      agent: r?.agent ?? '',
      capacity: r?.capacity ?? '',
      location: r?.location ?? '',
      notes: r?.notes ?? '',
    });
    this.editing = true;
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: Partial<PlantFireEquipmentPayload> = {
      equipment_type: v.equipment_type as FireEquipmentType,
      serial_number: text(v.serial_number),
      agent: text(v.agent),
      capacity: text(v.capacity),
      location: text(v.location),
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
