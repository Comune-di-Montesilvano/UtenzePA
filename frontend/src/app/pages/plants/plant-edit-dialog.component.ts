import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTabsModule} from '@angular/material/tabs';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {UtilityService} from '../utilities/utility.service';
import {toIsoDate} from '../utilities/consumptions/consumption.model';
import {PlantService} from './plant.service';
import {
  certificationStatus,
  Plant,
  PLANT_STATUS_LABEL,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  PLANT_TYPES,
  PlantElevatorData,
  PlantPayload,
  PlantStatus,
  PlantThermalData,
  PlantType,
  POSITION_LABEL,
  positionBadge,
} from './plant.model';
import {PlantInspectionsTabComponent} from './plant-inspections-tab.component';
import {PlantFireEquipmentTabComponent} from './plant-fire-equipment-tab.component';

export interface PlantEditDialogData {
  // null = nuovo impianto.
  plantId: number | null;
  // Immobile precompilato (nuovo impianto dal dialog immobile).
  assetId?: number | null;
  readOnly: boolean;
}

const COUNT_FIELDS: {key: 'outdoor_units' | 'indoor_units' | 'fan_coils' | 'air_handling_units' | 'chillers_heat_pumps'; label: string}[] = [
  {key: 'outdoor_units', label: 'Unità esterne'},
  {key: 'indoor_units', label: 'Unità interne'},
  {key: 'fan_coils', label: 'Ventilconvettori'},
  {key: 'air_handling_units', label: 'Unità trattamento aria'},
  {key: 'chillers_heat_pumps', label: 'Gruppi frigo / pompe di calore'},
];

const toDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Dialog impianto: salva da sé (come il vecchio dialog impianti termici) e
// chiude con true se qualcosa è stato salvato. Dopo la creazione resta aperto
// in modifica, così si possono aggiungere subito verifiche, presidi e foto.
@Component({
  selector: 'app-plant-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatIconModule, MatTabsModule, MatDatepickerModule, MatProgressBarModule,
    MultiSelectComponent, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    PlantInspectionsTabComponent, PlantFireEquipmentTabComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ title() }}</h2>
    <mat-dialog-content>
      @if (loading) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }
      <form [formGroup]="form">
        <mat-tab-group animationDuration="0ms" [mat-stretch-tabs]="false">
          <mat-tab label="Dati">
            <div style="display: flex; flex-direction: column; gap: 0.75rem; padding-top: 1rem;">
              <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
                <mat-form-field style="flex: 1 1 240px;">
                  <mat-label>Tipo *</mat-label>
                  <mat-select formControlName="type">
                    <mat-select-trigger>{{ typeLabel[currentType()] }}</mat-select-trigger>
                    @for (t of types; track t) {
                      <mat-option [value]="t"><span><mat-icon style="vertical-align: middle; margin-right: 6px;">{{ typeIcon[t] }}</mat-icon>{{ typeLabel[t] }}</span></mat-option>
                    }
                  </mat-select>
                  @if (typeLocked()) {
                    <mat-hint>Tipo bloccato: ci sono presidi antincendio</mat-hint>
                  }
                </mat-form-field>
                <mat-form-field style="flex: 1 1 160px;">
                  <mat-label>Codice *</mat-label>
                  <input matInput formControlName="code" placeholder="es. fon_17">
                </mat-form-field>
                <mat-form-field style="flex: 2 1 280px;">
                  <mat-label>Nome *</mat-label>
                  <input matInput formControlName="name">
                </mat-form-field>
                <mat-form-field style="flex: 1 1 160px;">
                  <mat-label>Stato</mat-label>
                  <mat-select formControlName="status">
                    @for (s of statuses; track s) {
                      <mat-option [value]="s">{{ statusLabel[s] }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
              <app-multi-select
                label="Immobili collegati"
                placeholder="Nessuno (es. fontana in piazza)"
                [options]="assetOptions"
                formControlName="asset_ids">
              </app-multi-select>
              <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
                <mat-form-field style="flex: 1 1 160px;">
                  <mat-label>Toponimo</mat-label>
                  <input matInput formControlName="toponym" placeholder="es. Via, Piazza">
                </mat-form-field>
                <mat-form-field style="flex: 3 1 300px;">
                  <mat-label>Indirizzo</mat-label>
                  <input matInput formControlName="address">
                </mat-form-field>
                <mat-form-field style="flex: 0 1 120px;">
                  <mat-label>Civico</mat-label>
                  <input matInput formControlName="civic_number">
                </mat-form-field>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong>Posizione</strong>
                @if (plant) {
                  @let pb = posBadge();
                  <span [style.background]="pb.bg" [style.color]="pb.fg"
                        style="border-radius: 10px; padding: 1px 8px; font-size: 0.75rem;">{{ positionLabel[plant.position_quality] }}</span>
                }
              </div>
              <app-location-map
                [latitude]="form.controls.latitude.value"
                [longitude]="form.controls.longitude.value"
                [estimatedLatitude]="estimated()?.lat ?? null"
                [estimatedLongitude]="estimated()?.lng ?? null"
                [previewOnly]="data.readOnly"
                (positionSelected)="onPositionSelected($event)"
                (positionCleared)="onPositionCleared()">
              </app-location-map>
              @if (!form.controls.latitude.value && estimated()) {
                <div style="font-size: 0.8rem; color: #757575;">
                  {{ plant?.position_quality === 'FROM_ASSET' ? "Posizione dell'immobile collegato" : 'Posizione stimata da indirizzo (geocodifica)' }}
                  — clicca sulla mappa per fissarne una propria.
                </div>
              }
              <mat-form-field>
                <mat-label>Note</mat-label>
                <textarea matInput rows="2" formControlName="notes"></textarea>
              </mat-form-field>
            </div>
          </mat-tab>

          @if (currentType() === 'THERMAL' || currentType() === 'ELEVATOR') {
            <mat-tab label="Dati tecnici">
              <div style="display: flex; flex-direction: column; gap: 1rem; padding-top: 1rem;">
                @if (currentType() === 'THERMAL') {
                  <div formGroupName="thermal" style="display: flex; flex-direction: column; gap: 1rem;">
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
                    @if (plant?.obligations; as o) {
                      @let vvf = cert(o.vvf_required, !!plant?.thermal?.vvf_exempt, plant?.thermal?.vvf_certification ?? null);
                      @let inail = cert(o.inail_required, !!plant?.thermal?.inail_exempt, plant?.thermal?.inail_certification ?? null);
                      <div style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.85rem;">
                        <span>VVF: <span [style.background]="vvf.bg" [style.color]="vvf.fg" style="border-radius: 10px; padding: 1px 8px;">{{ vvf.text }}</span></span>
                        <span>INAIL: <span [style.background]="inail.bg" [style.color]="inail.fg" style="border-radius: 10px; padding: 1px 8px;">{{ inail.text }}</span></span>
                        <span>Controllo efficienza: {{ o.efficiency_check_required ? 'obbligatorio (≥ 10 kW)' : 'non richiesto' }}</span>
                      </div>
                    }
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
                    <p style="color: #6b7280; font-size: 0.75rem; margin: 0;">
                      Obblighi indicativi calcolati dalla potenza: controllo di efficienza da 10 kW (DPR 74/2013), INAIL oltre 35 kW, VVF oltre 116 kW (DPR 151/2011).
                    </p>
                  </div>
                }
                @if (currentType() === 'ELEVATOR') {
                  <div formGroupName="elevator" style="display: flex; flex-wrap: wrap; gap: 1rem;">
                    <mat-form-field style="flex: 1 1 180px;">
                      <mat-label>Matricola</mat-label>
                      <input matInput formControlName="serial_number">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 180px;">
                      <mat-label>Numero impianto</mat-label>
                      <input matInput formControlName="plant_number">
                    </mat-form-field>
                    <mat-form-field style="flex: 2 1 240px;">
                      <mat-label>Costruttore</mat-label>
                      <input matInput formControlName="manufacturer">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 120px;">
                      <mat-label>Anno</mat-label>
                      <input matInput type="number" min="1900" max="2100" step="1" formControlName="year">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 180px;">
                      <mat-label>Data collaudo</mat-label>
                      <input matInput [matDatepicker]="testPicker" formControlName="test_date" placeholder="GG/MM/AAAA">
                      <mat-datepicker-toggle matIconSuffix [for]="testPicker"></mat-datepicker-toggle>
                      <mat-datepicker #testPicker></mat-datepicker>
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 200px;">
                      <mat-label>Tipologia</mat-label>
                      <input matInput formControlName="elevator_type" placeholder="ascensore, montacarichi, piattaforma">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 160px;">
                      <mat-label>Azionamento</mat-label>
                      <input matInput formControlName="drive" placeholder="elettrico, oleodinamico">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 120px;">
                      <mat-label>Portata (kg)</mat-label>
                      <input matInput type="number" min="0" step="1" formControlName="capacity_kg">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 100px;">
                      <mat-label>Fermate</mat-label>
                      <input matInput type="number" min="0" step="1" formControlName="stops">
                    </mat-form-field>
                    <mat-form-field style="flex: 1 1 120px;">
                      <mat-label>Velocità</mat-label>
                      <input matInput formControlName="speed" placeholder="es. 0,63 m/s">
                    </mat-form-field>
                  </div>
                }
              </div>
            </mat-tab>
          }

          @if (plant && currentType() === 'FIRE_PROTECTION') {
            <mat-tab label="Presidi">
              <app-plant-fire-equipment-tab
                [plantId]="plant.id"
                [rows]="plant.fireEquipment"
                [readOnly]="data.readOnly"
                (changed)="reloadPlant()">
              </app-plant-fire-equipment-tab>
            </mat-tab>
          }

          @if (plant) {
            <mat-tab label="Verifiche">
              <app-plant-inspections-tab
                [plantId]="plant.id"
                [plantType]="plant.type"
                [powerKw]="plant.thermal?.power_kw ?? null"
                [rows]="plant.inspections"
                [readOnly]="data.readOnly"
                (changed)="reloadPlant()">
              </app-plant-inspections-tab>
            </mat-tab>
          }

          <mat-tab label="Utenze">
            <div style="padding-top: 1rem;">
              <app-multi-select
                label="Utenze a servizio dell'impianto"
                placeholder="Cerca utenza..."
                [options]="utilityOptions"
                formControlName="utility_ids">
              </app-multi-select>
            </div>
          </mat-tab>

          @if (plant) {
            <mat-tab label="Foto">
              <ng-template matTabContent>
                <div style="padding-top: 1rem;">
                  <app-photo-gallery [entityType]="'plant'" [entityId]="plant.id"></app-photo-gallery>
                </div>
              </ng-template>
            </mat-tab>
            <mat-tab label="Storico">
              <ng-template matTabContent>
                <div style="padding-top: 1rem;">
                  <app-entity-history
                    [entity]="'plants'"
                    [entityId]="plant.id"
                    [lastModifiedBy]="plant.updated_by ? (plant.updated_by.firstName ?? '') + ' ' + (plant.updated_by.lastName ?? '') : null"
                    [lastModifiedAt]="plant.update_date ?? null">
                  </app-entity-history>
                </div>
              </ng-template>
            </mat-tab>
          }
        </mat-tab-group>
      </form>
      @if (error) {
        <p style="color: #b91c1c; margin: 0.5rem 0 0;">{{ error }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close(saved)">{{ data.readOnly ? 'Chiudi' : 'Annulla' }}</button>
      @if (!data.readOnly) {
        <button mat-flat-button (click)="save()" [disabled]="form.invalid || saving || loading">Salva</button>
      }
    </mat-dialog-actions>
  `,
})
export class PlantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PlantService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);
  protected dialogRef = inject(MatDialogRef<PlantEditDialogComponent, boolean>);
  protected data = inject<PlantEditDialogData>(MAT_DIALOG_DATA);

  readonly types = PLANT_TYPES;
  readonly typeLabel = PLANT_TYPE_LABEL;
  readonly typeIcon = PLANT_TYPE_ICON;
  readonly statuses = Object.keys(PLANT_STATUS_LABEL) as PlantStatus[];
  readonly statusLabel = PLANT_STATUS_LABEL;
  readonly positionLabel = POSITION_LABEL;
  readonly countFields = COUNT_FIELDS;
  readonly cert = certificationStatus;

  plant: Plant | null = null;
  assetOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  loading = false;
  saving = false;
  // true se qualcosa è stato salvato (anche verifiche/presidi): la pagina ricarica.
  saved = false;
  error: string | null = null;

  form = this.fb.group({
    type: ['FOUNTAIN' as PlantType, Validators.required],
    code: ['', [Validators.required, Validators.maxLength(100)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    status: ['ACTIVE' as PlantStatus],
    asset_ids: [(this.data.assetId ? [this.data.assetId] : []) as (string | number | boolean)[]],
    toponym: [''],
    address: [''],
    civic_number: [''],
    latitude: [null as string | null],
    longitude: [null as string | null],
    notes: [''],
    utility_ids: [[] as (string | number | boolean)[]],
    thermal: this.fb.group({
      power_kw: [null as number | null, Validators.min(0)],
      generators_description: [''],
      vvf_certification: [''],
      vvf_exempt: [false],
      inail_certification: [''],
      inail_exempt: [false],
      served_area_sqm: [null as number | null, Validators.min(0)],
      water_room: [null as boolean | null],
      outdoor_units: [null as number | null, Validators.min(0)],
      indoor_units: [null as number | null, Validators.min(0)],
      fan_coils: [null as number | null, Validators.min(0)],
      air_handling_units: [null as number | null, Validators.min(0)],
      chillers_heat_pumps: [null as number | null, Validators.min(0)],
    }),
    elevator: this.fb.group({
      serial_number: [''],
      plant_number: [''],
      manufacturer: [''],
      year: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
      test_date: [null as Date | null],
      elevator_type: [''],
      drive: [''],
      capacity_kg: [null as number | null, Validators.min(0)],
      stops: [null as number | null, Validators.min(0)],
      speed: [''],
    }),
  });

  ngOnInit(): void {
    if (this.data.readOnly) this.form.disable();
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => this.assetOptions = assets
        .map(a => ({label: a.asset_name ?? '', value: a.id, sublabel: a.associated_building ?? undefined,
          searchText: `${a.asset_name ?? ''} ${a.associated_building ?? ''}`}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore caricamento immobili:', err),
    });
    this.utilityService.search({deleted: false}).subscribe({
      next: utilities => this.utilityOptions = utilities.map(u => ({
        label: u.utility_id ?? `#${u.id}`,
        value: u.id,
        sublabel: u.utilityType?.name ?? undefined,
        searchText: `${u.utility_id ?? ''} ${u.utility_code ?? ''} ${u.utilityType?.name ?? ''}`,
      })),
      error: err => console.error('Errore caricamento utenze:', err),
    });
    if (this.data.plantId) this.load(this.data.plantId);
  }

  title(): string {
    if (!this.plant) return 'Nuovo impianto';
    return `${PLANT_TYPE_LABEL[this.plant.type]}: ${this.plant.code} — ${this.plant.name}`;
  }

  currentType(): PlantType {
    return this.form.controls.type.value as PlantType;
  }

  typeLocked(): boolean {
    return (this.plant?.fireEquipment?.length ?? 0) > 0;
  }

  posBadge(): {bg: string; fg: string} {
    return positionBadge(this.plant?.position_quality ?? 'MISSING');
  }

  // Posizione mostrata quando l'impianto non ha coordinate proprie.
  estimated(): {lat: string; lng: string} | null {
    if (!this.plant || this.plant.position_quality === 'PRECISE') return null;
    return this.plant.position;
  }

  onPositionSelected(pos: {lat: string; lng: string}): void {
    this.form.patchValue({latitude: pos.lat, longitude: pos.lng});
    this.form.markAsDirty();
  }

  onPositionCleared(): void {
    this.form.patchValue({latitude: null, longitude: null});
    this.form.markAsDirty();
  }

  reloadPlant(): void {
    this.saved = true;
    if (this.plant) this.load(this.plant.id, false);
  }

  private load(id: number, patchForm = true): void {
    this.loading = true;
    this.service.get(id).subscribe({
      next: plant => {
        this.plant = plant;
        this.loading = false;
        if (patchForm) this.patch(plant);
        if (this.typeLocked()) this.form.controls.type.disable();
      },
      error: err => {
        this.loading = false;
        this.error = 'Impianto non trovato.';
        console.error('Errore caricamento impianto:', err);
      },
    });
  }

  private patch(p: Plant): void {
    const t = p.thermal;
    const e = p.elevator;
    this.form.patchValue({
      type: p.type,
      code: p.code,
      name: p.name,
      status: p.status,
      asset_ids: (p.assets ?? []).map(a => a.id),
      toponym: p.toponym ?? '',
      address: p.address ?? '',
      civic_number: p.civic_number ?? '',
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      notes: p.notes ?? '',
      utility_ids: (p.utilities ?? []).map(u => u.id),
      thermal: {
        power_kw: t?.power_kw !== null && t?.power_kw !== undefined ? Number(t.power_kw) : null,
        generators_description: t?.generators_description ?? '',
        vvf_certification: t?.vvf_certification ?? '',
        vvf_exempt: !!t?.vvf_exempt,
        inail_certification: t?.inail_certification ?? '',
        inail_exempt: !!t?.inail_exempt,
        served_area_sqm: t?.served_area_sqm !== null && t?.served_area_sqm !== undefined ? Number(t.served_area_sqm) : null,
        water_room: t?.water_room ?? null,
        outdoor_units: t?.outdoor_units ?? null,
        indoor_units: t?.indoor_units ?? null,
        fan_coils: t?.fan_coils ?? null,
        air_handling_units: t?.air_handling_units ?? null,
        chillers_heat_pumps: t?.chillers_heat_pumps ?? null,
      },
      elevator: {
        serial_number: e?.serial_number ?? '',
        plant_number: e?.plant_number ?? '',
        manufacturer: e?.manufacturer ?? '',
        year: e?.year ?? null,
        test_date: toDate(e?.test_date),
        elevator_type: e?.elevator_type ?? '',
        drive: e?.drive ?? '',
        capacity_kg: e?.capacity_kg ?? null,
        stops: e?.stops ?? null,
        speed: e?.speed ?? '',
      },
    });
    this.form.markAsPristine();
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const num = (n: number | null | undefined) => (n === null || n === undefined || `${n}` === '' ? null : Number(n));
    const type = v.type as PlantType;
    const payload: PlantPayload = {
      type,
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      status: v.status as PlantStatus,
      asset_ids: (v.asset_ids ?? []).map(Number),
      toponym: text(v.toponym),
      address: text(v.address),
      civic_number: text(v.civic_number),
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      notes: text(v.notes),
      utility_ids: (v.utility_ids ?? []).map(Number),
    };
    // Dati specifici solo per il tipo corrente.
    if (type === 'THERMAL') {
      const t = v.thermal;
      const thermal: PlantThermalData = {
        power_kw: num(t.power_kw),
        generators_description: text(t.generators_description),
        vvf_certification: text(t.vvf_certification),
        vvf_exempt: !!t.vvf_exempt,
        inail_certification: text(t.inail_certification),
        inail_exempt: !!t.inail_exempt,
        served_area_sqm: num(t.served_area_sqm),
        water_room: t.water_room ?? null,
        outdoor_units: num(t.outdoor_units),
        indoor_units: num(t.indoor_units),
        fan_coils: num(t.fan_coils),
        air_handling_units: num(t.air_handling_units),
        chillers_heat_pumps: num(t.chillers_heat_pumps),
      };
      payload.thermal = thermal;
    }
    if (type === 'ELEVATOR') {
      const e = v.elevator;
      const elevator: PlantElevatorData = {
        serial_number: text(e.serial_number),
        plant_number: text(e.plant_number),
        manufacturer: text(e.manufacturer),
        year: num(e.year),
        test_date: e.test_date ? toIsoDate(e.test_date) : null,
        elevator_type: text(e.elevator_type),
        drive: text(e.drive),
        capacity_kg: num(e.capacity_kg),
        stops: num(e.stops),
        speed: text(e.speed),
      };
      payload.elevator = elevator;
    }
    this.saving = true;
    this.error = null;
    const request = this.plant ? this.service.update(this.plant.id, payload) : this.service.create(payload);
    const isNew = !this.plant;
    request.subscribe({
      next: plant => {
        this.saving = false;
        this.saved = true;
        if (isNew) {
          // Resta aperto in modifica: verifiche, presidi e foto richiedono l'id.
          this.plant = plant;
          this.patch(plant);
        } else {
          this.dialogRef.close(true);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }
}
