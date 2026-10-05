import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {Asset} from '../assets/entity/asset.entity';
import {UtilityService} from '../utilities/utility.service';
import {Utility} from '../utilities/entity/utility.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {toIsoDate} from '../utilities/consumptions/consumption.model';
import {PlantService} from './plant.service';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {
  certificationStatus,
  inspectionStatusOf,
  missingCertifications,
  Plant,
  PLANT_STATUS_LABEL,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  PLANT_TYPES,
  PlantElevatorData,
  PlantPayload,
  PlantStatus,
  PlantTab,
  plantTabs,
  PlantThermalData,
  PlantType,
} from './plant.model';
import {PlantInspectionsTabComponent} from './plant-inspections-tab.component';
import {PlantFireEquipmentTabComponent} from './plant-fire-equipment-tab.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {
  assetStatus,
  inspectionStatusInfo,
  plantStatus,
  positionStatusInfo,
  StatusInfo,
  utilityStatus,
} from '../../core/helpers/entity-status';
import {dateIt, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

export interface PlantEditDialogData {
  // null = nuovo impianto.
  plantId: number | null;
  // Immobile precompilato (nuovo impianto dal dialog immobile).
  assetId?: number | null;
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

// Dialog impianto: salva da sé e chiude con true se qualcosa è stato
// salvato. Dopo la creazione resta aperto in modifica, così si possono
// aggiungere subito verifiche, presidi e foto.
@Component({
  selector: 'app-plant-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatIconModule, MatTabsModule, MatDatepickerModule, MatProgressBarModule,
    LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    PlantInspectionsTabComponent, PlantFireEquipmentTabComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './plant-edit-dialog.component.html',
})
export class PlantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PlantService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);
  private navigator = inject(EntityNavigatorService);
  protected dialogRef = inject(MatDialogRef<PlantEditDialogComponent, Plant | null>);
  protected data = inject<PlantEditDialogData>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly types = PLANT_TYPES;
  readonly typeLabel = PLANT_TYPE_LABEL;
  readonly typeIcon = PLANT_TYPE_ICON;
  readonly statuses = Object.keys(PLANT_STATUS_LABEL) as PlantStatus[];
  readonly statusLabel = PLANT_STATUS_LABEL;
  readonly countFields = COUNT_FIELDS;
  readonly cert = certificationStatus;
  // Stessa regola delle altre schede (Admin, Operatore).
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);

  plant: Plant | null = null;
  private allAssets: Asset[] = [];
  private allUtilities: Utility[] = [];
  assetOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  assetRows: Asset[] = [];
  utilityRows: Utility[] = [];
  assetPreview: PreviewItem[] = [];
  utilityPreview: PreviewItem[] = [];
  inspectionPreview: PreviewItem[] = [];
  loading = false;
  saving = false;
  // true se qualcosa è stato salvato (anche verifiche/presidi): la pagina ricarica.
  saved = false;
  error: string | null = null;

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? `#${u.id}`},
    {label: 'Tipo uso', value: u => u.utilityType?.name ?? ''},
    {label: 'Immobili', value: u => (u.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

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

  // Collegamenti utenze come letti dal server: distinguono un collegamento
  // aggiunto/tolto qui e non ancora salvato da uno cambiato in una scheda figlia.
  private savedUtilityIds = new Set<number>();

  ngOnInit(): void {
    if (!this.canEdit) this.form.disable();
    else {
      this.syncTypeGroups();
      this.form.controls.type.valueChanges.subscribe(() => this.syncTypeGroups());
    }
    this.loadAssets();
    this.loadUtilities();
    if (this.data.plantId) this.load(this.data.plantId);
  }

  private loadAssets(): void {
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => {
        this.allAssets = assets;
        this.assetOptions = assets
          .map(a => ({label: a.asset_name ?? '', value: a.id, sublabel: a.associated_building ?? undefined,
            searchText: `${a.asset_name ?? ''} ${a.associated_building ?? ''}`}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento immobili:', err),
    });
  }

  private loadUtilities(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: utilities => {
        this.allUtilities = utilities;
        this.utilityOptions = utilities.map(u => ({
          label: u.utility_id ?? `#${u.id}`,
          value: u.id,
          sublabel: u.utilityType?.name ?? undefined,
          searchText: `${u.utility_id ?? ''} ${u.utility_code ?? ''} ${u.utilityType?.name ?? ''}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento utenze:', err),
    });
  }

  refreshLinks(): void {
    const assetIds = (this.form.controls.asset_ids.value ?? []).map(Number);
    this.assetRows = assetIds
      .map(id => this.allAssets.find(a => a.id === id) ?? (this.plant?.assets.find(a => a.id === id) as Asset | undefined))
      .filter((a): a is Asset => !!a);
    const utilityIds = (this.form.controls.utility_ids.value ?? []).map(Number);
    this.utilityRows = utilityIds
      // Finché l'elenco completo non arriva (centinaia di utenze, qualche
      // secondo) si usa il dato parziale dell'impianto: il conteggio non
      // deve mostrare 0 nel frattempo.
      .map(id => this.allUtilities.find(u => u.id === id) ?? (this.plant?.utilities.find(u => u.id === id) as Utility | undefined))
      .filter((u): u is Utility => !!u);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
    this.utilityPreview = this.utilityRows.map(u => {
      const t = u.utilityType?.hard_type;
      return {
        id: u.id, label: u.utility_id ?? `#${u.id}`, sublabel: u.utilityType?.name ?? undefined,
        icon: t ? HardTypeMatIcon[t] : 'electric_meter', color: t ? HardTypeColor[t] : 'var(--entity-utility)',
        status: utilityStatus(u.supply_active),
      };
    });
    this.inspectionPreview = [...(this.plant?.inspections ?? [])]
      .sort((a, b) => (a.next_date ?? '9999').localeCompare(b.next_date ?? '9999'))
      .map(i => ({
        id: i.id, label: i.kind, sublabel: i.next_date ? `Prossima: ${dateIt(i.next_date)}` : 'Senza scadenza',
        icon: 'event', color: 'var(--entity-plant)', status: inspectionStatusInfo(inspectionStatusOf(i.next_date)),
      }));
  }

  // Header
  // Segue il form, come le altre schede (non il record salvato).
  title(): string {
    const v = this.form.getRawValue();
    const text = [v.code, v.name].map(x => (x ?? '').toString().trim()).filter(Boolean).join(' — ');
    return text || (this.plant ? `Impianto #${this.plant.id}` : 'Nuovo impianto');
  }

  subtitle(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [PLANT_TYPE_LABEL[this.currentType()], street].filter(Boolean).join(' · ');
  }

  lastModified(): string | null {
    return this.plant ? lastModifiedLabel(this.plant.update_date, this.plant.updated_by) : null;
  }

  statusInfo(): StatusInfo {
    return plantStatus(this.form.controls.status.value as PlantStatus);
  }

  positionInfo(): StatusInfo | null {
    return this.plant ? positionStatusInfo(this.plant.position_quality) : null;
  }

  // In header solo verifiche scadute o in scadenza.
  inspectionFlag(): StatusInfo | null {
    const info = inspectionStatusInfo(this.plant?.inspection_status);
    return info && (info.tone === 'danger' || info.tone === 'warn') ? info : null;
  }

  // Solo il gruppo dati del tipo corrente partecipa alla validazione: un
  // valore invalido in un gruppo nascosto (tipo cambiato, dato importato)
  // bloccherebbe il Salva senza nulla di visibile.
  private syncTypeGroups(): void {
    const type = this.currentType();
    const toggle = (group: 'thermal' | 'elevator', on: boolean) => {
      const c = this.form.controls[group];
      if (on) c.enable({emitEvent: false});
      else c.disable({emitEvent: false});
    };
    toggle('thermal', type === 'THERMAL');
    toggle('elevator', type === 'ELEVATOR');
  }

  currentType(): PlantType {
    return this.form.controls.type.value as PlantType;
  }

  hasTab(tab: PlantTab): boolean {
    return plantTabs(this.currentType()).includes(tab);
  }

  typeLocked(): boolean {
    return (this.plant?.fireEquipment?.length ?? 0) > 0;
  }

  missingCerts(): string[] {
    return this.plant ? missingCertifications(this.plant) : [];
  }

  overdueInspections(): boolean {
    return this.plant?.inspection_status === 'OVERDUE';
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
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

  // Collegamenti (form control → salvati con "Salva")
  private setIds(control: 'asset_ids' | 'utility_ids', ids: number[]): void {
    const c = this.form.controls[control];
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    this.setIds('asset_ids', [...(this.form.controls.asset_ids.value ?? []).map(Number), id]);
  }

  unlinkAsset(id: number): void {
    this.setIds('asset_ids', (this.form.controls.asset_ids.value ?? []).map(Number).filter(x => x !== id));
  }

  addUtility(id: number): void {
    this.setIds('utility_ids', [...(this.form.controls.utility_ids.value ?? []).map(Number), id]);
  }

  unlinkUtility(id: number): void {
    this.setIds('utility_ids', (this.form.controls.utility_ids.value ?? []).map(Number).filter(x => x !== id));
  }

  openAsset(id: number): void {
    // Riallineamento anche senza salvataggio qui: più in alto nella pila
    // qualcosa può essere stato salvato.
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.loadAssets();
      this.resyncUtilityLinks();
    });
  }

  // L'utenza salva i suoi plant_ids: dopo il salvataggio riallinea
  // utility_ids, altrimenti "Salva" qui sovrascriverebbe la modifica.
  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.loadUtilities();
      this.resyncUtilityLinks();
    });
  }

  // Catene di schede (impianto → utenza → impianto…): una scheda più in alto
  // può aver cambiato legami di questo impianto. Si rileggono tutti dal server,
  // non solo quello del figlio diretto; le modifiche fatte qui e non salvate vincono.
  private resyncUtilityLinks(): void {
    if (!this.plant) return;
    this.service.get(this.plant.id).subscribe({
      next: p => {
        const server = new Set((p.utilities ?? []).map(u => u.id));
        for (const id of new Set([...this.savedUtilityIds, ...server])) this.syncUtilityLink(id, server.has(id));
      },
      error: err => console.error('Errore nel riallineamento delle utenze:', err),
    });
  }

  private syncUtilityLink(utilityId: number, linked: boolean): void {
    const ids = (this.form.controls.utility_ids.value ?? []).map(Number);
    const has = ids.includes(utilityId);
    const toggledHere = has !== this.savedUtilityIds.has(utilityId);
    if (linked) this.savedUtilityIds.add(utilityId);
    else this.savedUtilityIds.delete(utilityId);
    // Modifica fatta qui e non ancora salvata: vince quella.
    if (toggledHere || linked === has) return;
    this.form.controls.utility_ids.setValue(linked ? [...ids, utilityId] : ids.filter(x => x !== utilityId));
    this.refreshLinks();
  }

  // Al chiamante: l'impianto se qualcosa è stato salvato, altrimenti null.
  close(): void {
    this.dialogRef.close(this.saved ? this.plant : null);
  }

  newAsset(): void {
    this.navigator.createAsset().subscribe(a => {
      if (!a) return;
      this.loadAssets();
      this.addAsset(a.id);
    });
  }

  // Solo con impianto salvato: un'utenza senza immobile né impianto non si
  // salva. Il legame è già sul server: va tra i salvati, non tra le modifiche.
  newUtility(): void {
    if (!this.plant) return;
    this.navigator.createUtility(Utility.create({plant_ids: [this.plant.id]})).subscribe(u => {
      if (!u) return;
      this.loadUtilities();
      this.savedUtilityIds.add(u.id);
      this.addUtility(u.id);
      this.saved = true;
    });
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
        this.refreshLinks();
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
    this.savedUtilityIds = new Set((p.utilities ?? []).map(u => u.id));
    if (this.canEdit) this.syncTypeGroups();
    this.form.markAsPristine();
    this.refreshLinks();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Correggi i campi evidenziati (pallino rosso sul tab).';
      return;
    }
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
          this.plant = plant;
          this.close();
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
