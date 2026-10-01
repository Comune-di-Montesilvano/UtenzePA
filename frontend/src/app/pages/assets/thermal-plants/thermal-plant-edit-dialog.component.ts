import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {HttpErrorResponse} from '@angular/common/http';
import {ThermalPlant, ThermalPlantPayload, ThermalPlantService} from './thermal-plant.service';
import {AssetService} from '../asset.service';
import {HardType} from '../../utility-types/enum/hard-type.enum';
import {FilterableSelectComponent} from '../../../core/components/filterable-select.component';
import {TOption} from '../../../core/types/option.interface';

export interface ThermalPlantEditDialogData {
  // null = nuovo impianto dalla vista dedicata: l'immobile si sceglie nel form.
  assetId: number | null;
  assetOptions?: TOption[];
  item?: ThermalPlant;
  readOnly: boolean;
}

const COUNT_FIELDS: {key: keyof ThermalPlantPayload; label: string}[] = [
  {key: 'outdoor_units', label: 'Unità esterne'},
  {key: 'indoor_units', label: 'Unità interne'},
  {key: 'fan_coils', label: 'Ventilconvettori'},
  {key: 'air_handling_units', label: 'Unità trattamento aria'},
  {key: 'chillers_heat_pumps', label: 'Gruppi frigo / pompe di calore'},
];

@Component({
  selector: 'app-thermal-plant-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Impianto termico: ' + data.item.name : 'Nuovo impianto termico' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: flex; flex-direction: column; gap: 1rem; padding-top: 0.5rem;">
        @if (data.assetId === null) {
          <app-filterable-select
            label="Immobile *"
            placeholder="Cerca immobile..."
            [options]="data.assetOptions ?? []"
            formControlName="asset_id">
          </app-filterable-select>
        }
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          <mat-form-field style="flex: 2 1 300px;">
            <mat-label>Denominazione *</mat-label>
            <input matInput formControlName="name" placeholder="es. Centrale termica">
          </mat-form-field>
          <mat-form-field style="flex: 1 1 220px;">
            <mat-label>Utenza di alimentazione</mat-label>
            <mat-select formControlName="utility_id_fk">
              <mat-option [value]="null">Nessuna</mat-option>
              @for (u of utilityOptions; track u.id) {
                <mat-option [value]="u.id">{{ u.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
          <legend style="padding: 0 0.5rem; font-weight: 600;">Centrale termica</legend>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            <mat-form-field style="flex: 1 1 150px;">
              <mat-label>Potenza totale (kW)</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="power_kw">
              <mat-hint>Somma dei generatori</mat-hint>
            </mat-form-field>
            <mat-form-field style="flex: 1 1 150px;">
              <mat-label>Generatori</mat-label>
              <input matInput formControlName="generators_description" placeholder="es. 160+80">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 150px;">
              <mat-label>Mq serviti</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="served_area_sqm">
            </mat-form-field>
            <mat-form-field style="flex: 1 1 150px;">
              <mat-label>Locale idrico</mat-label>
              <mat-select formControlName="water_room">
                <mat-option [value]="null">Non indicato</mat-option>
                <mat-option [value]="true">Sì</mat-option>
                <mat-option [value]="false">No</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
            <mat-form-field style="flex: 1 1 280px;">
              <mat-label>Certificazione VVF</mat-label>
              <input matInput formControlName="vvf_certification" placeholder="es. pratica nr. ...">
              <mat-hint>Obbligatoria oltre 116 kW</mat-hint>
            </mat-form-field>
            <mat-checkbox formControlName="vvf_exempt">Esente VVF</mat-checkbox>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
            <mat-form-field style="flex: 1 1 280px;">
              <mat-label>Certificazione INAIL</mat-label>
              <input matInput formControlName="inail_certification" placeholder="es. pratica nr. ...">
              <mat-hint>Obbligatoria oltre 35 kW</mat-hint>
            </mat-form-field>
            <mat-checkbox formControlName="inail_exempt">Esente INAIL</mat-checkbox>
          </div>
        </fieldset>

        <fieldset style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 1rem;">
          <legend style="padding: 0 0.5rem; font-weight: 600;">Climatizzazione</legend>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
            @for (f of countFields; track f.key) {
              <mat-form-field style="flex: 1 1 160px;">
                <mat-label>{{ f.label }}</mat-label>
                <input matInput type="number" min="0" step="1" [formControlName]="f.key">
              </mat-form-field>
            }
          </div>
        </fieldset>

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
      <button mat-stroked-button (click)="dialogRef.close(false)">{{ data.readOnly ? 'Chiudi' : 'Annulla' }}</button>
      @if (!data.readOnly) {
        <button mat-flat-button (click)="save()" [disabled]="form.invalid || saving">Salva</button>
      }
    </mat-dialog-actions>
  `,
})
export class ThermalPlantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ThermalPlantService);
  private assetService = inject(AssetService);
  protected dialogRef = inject(MatDialogRef<ThermalPlantEditDialogComponent, boolean>);
  protected data = inject<ThermalPlantEditDialogData>(MAT_DIALOG_DATA);

  readonly countFields = COUNT_FIELDS;
  utilityOptions: {id: number; label: string}[] = [];
  error: string | null = null;
  saving = false;

  private readonly item = this.data.item;

  form = this.fb.group({
    asset_id: [this.data.assetId as number | null, Validators.required],
    name: [this.item?.name ?? 'Centrale termica', Validators.required],
    utility_id_fk: [this.item?.utility_id_fk ?? null as number | null],
    power_kw: [this.item?.power_kw ?? null as number | null, Validators.min(0)],
    generators_description: [this.item?.generators_description ?? ''],
    vvf_certification: [this.item?.vvf_certification ?? ''],
    vvf_exempt: [this.item?.vvf_exempt ?? false],
    inail_certification: [this.item?.inail_certification ?? ''],
    inail_exempt: [this.item?.inail_exempt ?? false],
    served_area_sqm: [this.item?.served_area_sqm ?? null as number | null, Validators.min(0)],
    water_room: [this.item?.water_room ?? null as boolean | null],
    outdoor_units: [this.item?.outdoor_units ?? null as number | null, Validators.min(0)],
    indoor_units: [this.item?.indoor_units ?? null as number | null, Validators.min(0)],
    fan_coils: [this.item?.fan_coils ?? null as number | null, Validators.min(0)],
    air_handling_units: [this.item?.air_handling_units ?? null as number | null, Validators.min(0)],
    chillers_heat_pumps: [this.item?.chillers_heat_pumps ?? null as number | null, Validators.min(0)],
    notes: [this.item?.notes ?? ''],
  });

  constructor() {
    if (this.data.readOnly) this.form.disable();
  }

  ngOnInit(): void {
    if (this.data.assetId !== null) this.loadUtilityOptions(this.data.assetId);
    this.form.controls.asset_id.valueChanges.subscribe(assetId => {
      this.form.controls.utility_id_fk.setValue(null);
      this.utilityOptions = [];
      if (assetId) this.loadUtilityOptions(Number(assetId));
    });
  }

  // Alimentazione: utenze gas (caldaia) o luce (pompa di calore) dell'immobile.
  private loadUtilityOptions(assetId: number): void {
    this.assetService.getById(assetId).subscribe({
      next: asset => {
        this.utilityOptions = (asset.utilities ?? [])
          .filter(u => u.utilityType?.hard_type === HardType.GAS || u.utilityType?.hard_type === HardType.LIGHT)
          .map(u => ({
            id: u.id,
            label: `${u.utility_id} (${u.utilityType?.name ?? ''}${u.supply_active ? '' : ', non attiva'})`,
          }));
      },
      error: err => console.error("Errore caricamento utenze dell'immobile:", err),
    });
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const num = (n: number | null | undefined) => (n === null || n === undefined || `${n}` === '' ? null : Number(n));
    const payload: ThermalPlantPayload = {
      name: (v.name ?? '').trim(),
      utility_id_fk: v.utility_id_fk ?? null,
      power_kw: num(v.power_kw),
      generators_description: text(v.generators_description),
      vvf_certification: text(v.vvf_certification),
      vvf_exempt: !!v.vvf_exempt,
      inail_certification: text(v.inail_certification),
      inail_exempt: !!v.inail_exempt,
      served_area_sqm: num(v.served_area_sqm),
      water_room: v.water_room ?? null,
      outdoor_units: num(v.outdoor_units),
      indoor_units: num(v.indoor_units),
      fan_coils: num(v.fan_coils),
      air_handling_units: num(v.air_handling_units),
      chillers_heat_pumps: num(v.chillers_heat_pumps),
      notes: text(v.notes),
    };
    this.saving = true;
    this.error = null;
    const request = this.item
      ? this.service.update(this.item.id, payload)
      : this.service.create(Number(v.asset_id), payload);
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
