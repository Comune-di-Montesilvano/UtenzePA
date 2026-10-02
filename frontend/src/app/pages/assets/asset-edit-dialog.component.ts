import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Asset} from './entity/asset.entity';
import {AuthService} from '../../services/auth.service';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {AssetNaturesService} from '../asset-nature/asset-nature.service';
import {AssetNature} from '../asset-nature/entity/asset-nature.entity';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {AssetFunction} from '../asset-function/entity/asset-function.entity';
import {ASSET_STATUS_OPTIONS, AssetStatus} from './enum/asset-status.enum';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';
import {HardType, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {PhotosService} from '../../services/photos.service';
import {ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {PlantService} from '../plants/plant.service';
import {Plant, PLANT_TYPE_ICON, PLANT_TYPE_LABEL} from '../plants/plant.model';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, formatEuro, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {
  assetStatus,
  grantStatus,
  inspectionStatusInfo,
  legacyTypeStatus,
  plantStatus,
  StatusInfo,
  utilityStatus,
} from '../../core/helpers/entity-status';
import {dateIt, hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

interface UtilitySection {
  type: HardType;
  label: string;
  icon: string;
  color: string;
  rows: Utility[];
}

interface UtilityTypeButton {
  value: HardType;
  label: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-asset-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatTabsModule, MatTooltipModule, MatIconModule, OnlyNumbersDirective, LatitudeInputDirective,
    LongitudeInputDirective, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-edit-dialog.component.html'
})
export class AssetEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetEditDialogComponent, Asset | undefined>);
  private authService = inject(AuthService);
  private naturesService = inject(AssetNaturesService);
  private functionsService = inject(AssetFunctionsService);
  private assetService = inject(AssetService);
  private photosService = inject(PhotosService);
  private utilityTypesService = inject(UtilityTypesService);
  private plantService = inject(PlantService);
  private grantService = inject(UtilizerGrantService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<Asset>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);

  natures: AssetNature[] = [];
  private allFunctions: AssetFunction[] = [];
  statusOptions = ASSET_STATUS_OPTIONS;

  // Regola di classificazione in ordine fisso: la prima risposta "sì"
  // decide, così due operatori classificano lo stesso oggetto allo stesso
  // modo (stessa regola del seed in 1790400000000-AddAssetClassification).
  readonly classificationRule = [
    `Rispondere nell'ordine, la prima risposta "sì" decide:`,
    `1. È un edificio chiuso, con muri e tetto, anche piccolo (es. chiosco)? → Fabbricato`,
    `2. È un dispositivo o un punto di fornitura tecnico (punto luce, semaforo, fontana, presa, pompa, cabina)? → Impianto`,
    `3. È un'opera costruita non chiusa (tribuna, pensilina, ponte, palco fisso, gazebo, colombario, monumento)? → Manufatto`,
    `4. Altrimenti è una superficie scoperta (parco, piazza, parcheggio, rotatoria, campo, terreno) → Area`,
  ].join('\n');

  // Obbligatori per immobili nuovi e per quelli già riclassificati (non
  // devono poter tornare "vuoti"); un immobile legacy si salva anche senza
  // riclassificarlo (tiene il vecchio tipo).
  mustClassify = this.isNew || this.data.item.asset_type_id == null;
  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();
  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];

  form = this.fb.group({
    asset_name: [this.data.item.asset_name ?? '', Validators.required],
    nature_id: [this.data.item.nature_id ?? null, this.mustClassify ? Validators.required : []],
    function_id: [this.data.item.function_id ?? null, this.mustClassify ? Validators.required : []],
    status: [this.data.item.status ?? AssetStatus.ATTIVO, Validators.required],
    category: [this.data.item.category ?? null],
    ownership: [this.data.item.ownership ?? 0],
    toponym: [this.data.item.toponym ?? null],
    address: [this.data.item.address ?? null],
    civic_number: [this.data.item.civic_number ?? null],
    municipality: [this.data.item.municipality ?? null],
    zip_code: [this.data.item.zip_code ?? null],
    services_and_artifacts: [this.data.item.services_and_artifacts ?? null],
    latitude: [this.data.item.latitude ?? null],
    longitude: [this.data.item.longitude ?? null],
    cadastral_value: [this.data.item.cadastral_value ?? null],
    sheet: [this.data.item.sheet ?? null],
    parcel: [this.data.item.parcel ?? null],
    subordinate: [this.data.item.subordinate ?? null],
    area_sqm: [this.data.item.area_sqm ?? null],
    associated_building: [this.data.item.associated_building ?? null],
    specific_details: [this.data.item.specific_details ?? null],
    memo: [this.data.item.memo ?? null],
  });

  photoCount: number | null = null;

  // Collegamenti: campi cache, aggiornati solo su load/aggiunta/salvataggio.
  utilitySections: UtilitySection[] = [];
  missingUtilityTypes: UtilityTypeButton[] = [];
  utilityPreview: PreviewItem[] = [];
  plants: Plant[] = [];
  plantPreview: PreviewItem[] = [];
  grants: UtilizerGrant[] = [];
  grantPreview: PreviewItem[] = [];

  // Serve ad "Aggiungi utenza" per pre-selezionare il UtilityType giusto in
  // base al tipo, dato che il form utenza lavora per id di UtilityType.
  private utilityTypeIdByHardType = new Map<HardType, number>();

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? ''},
    {label: 'Codice cliente', value: u => u.utility_code ?? ''},
    {label: 'Contatore', value: u => u.meter_number ?? ''},
    {label: 'Inizio fornitura', value: u => dateIt(u.supply_start_date)},
  ];
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  readonly plantColumns: LinkedColumn<Plant>[] = [
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
    {label: 'Codice', value: p => p.code},
    {label: 'Nome', value: p => p.name},
    {label: 'Utenze', value: p => (p.utilities ?? []).map(u => u.utility_id).join(', ')},
  ];
  readonly plantIconOf = (p: Plant): RowIcon => ({icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)'});
  readonly plantStatusOf = (p: Plant): StatusInfo | null => inspectionStatusInfo(p.inspection_status);

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Direzione', value: g => (g.direction ? DIRECTION_LABEL[g.direction] : '')},
    {label: 'Tipo', value: g => (g.kind ? KIND_LABEL[g.kind] : '')},
    {label: 'Controparte', value: g => g.utilizer?.name ?? ''},
    {label: 'Oggetto', value: g => g.subject ?? ''},
    {label: 'Canone annuo', value: g => formatEuro(g.annual_rent)},
    {label: 'Scadenza', value: g => dateIt(g.effective_end_date)},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status);

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    } else {
      this.syncFunctionEnabled();
      // Cambio natura: la funzione scelta potrebbe non essere più ammessa.
      this.form.controls.nature_id.valueChanges.subscribe(() => {
        const fid = this.form.controls.function_id.value;
        if (fid != null && !this.functionOptions().some(f => f.id === fid)) {
          this.form.controls.function_id.setValue(null);
        }
        this.syncFunctionEnabled();
      });
    }
  }

  // Funzione selezionabile solo dopo la natura (le funzioni ammesse
  // dipendono dalla natura).
  private syncFunctionEnabled(): void {
    const fn = this.form.controls.function_id;
    if (this.form.controls.nature_id.value == null) fn.disable({emitEvent: false});
    else fn.enable({emitEvent: false});
  }

  ngOnInit(): void {
    this.naturesService.search({deleted: false} as never).subscribe({
      next: data => this.natures = data,
      error: err => console.error('Errore nel caricamento delle tipologie immobile:', err)
    });
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => this.allFunctions = data,
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
    this.utilityTypesService.search({deleted: false}).subscribe({
      next: (data: UtilityType[]) => {
        this.utilityTypeIdByHardType.clear();
        for (const t of data) {
          if (!this.utilityTypeIdByHardType.has(t.hard_type)) this.utilityTypeIdByHardType.set(t.hard_type, t.id);
        }
      },
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
    this.refreshUtilities();
    if (!this.isNew) {
      // Conteggio "Foto (N)" prima di aprire il tab (lazy): solo metadati.
      this.photosService.list('asset', this.data.item.id).subscribe({
        next: photos => this.photoCount = photos.length,
        error: () => {}
      });
      this.loadPlants();
      this.loadGrants();
    }
  }

  // Icona header: segue la funzione selezionata nel form; in transizione
  // ricade sull'icona del vecchio aggregato, stesso fallback dei marker mappa.
  currentAssetIcon(): string {
    const fid = this.form.controls.function_id.value;
    const fn = this.allFunctions.find(f => f.id === fid);
    return fn?.icon || this.data.item.assetAggregator?.icon || ASSET_AGGREGATOR_ICON_FALLBACK;
  }

  functionOptions(): AssetFunction[] {
    const nature = this.natures.find(n => n.id === this.form.controls.nature_id.value);
    return nature?.functions ?? [];
  }

  selectedNature(): AssetNature | undefined {
    return this.natures.find(n => n.id === this.form.controls.nature_id.value);
  }

  selectedFunction(): AssetFunction | undefined {
    return this.allFunctions.find(f => f.id === this.form.controls.function_id.value);
  }

  // Vecchio tipo ancora valorizzato = immobile da riclassificare.
  legacyTypeLabel(): string | null {
    return this.data.item.asset_type_id != null ? (this.data.item.assetAggregator?.code ?? null) : null;
  }

  statusInfo(): StatusInfo {
    return assetStatus(this.form.controls.status.value);
  }

  legacyBadge(): StatusInfo | null {
    return legacyTypeStatus(this.legacyTypeLabel());
  }

  titleText(): string {
    return this.isNew ? 'Nuovo immobile' : (this.form.controls.asset_name.value || 'Immobile senza nome');
  }

  addressLine(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [street, v.municipality].filter(Boolean).join(', ');
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  utilityCount(): number {
    return this.data.item.utilities?.length ?? 0;
  }

  hasOverdueInspections(): boolean {
    return this.plants.some(p => p.inspection_status === 'OVERDUE');
  }

  hasExpiredGrants(): boolean {
    return this.grants.some(g => g.computed_status === 'EXPIRED');
  }

  private refreshUtilities(): void {
    const all = this.data.item.utilities ?? [];
    const types = HardType.items();
    this.utilitySections = types
      .map(t => ({
        type: t.value, label: t.label, icon: HardTypeMatIcon[t.value], color: t.color,
        rows: all.filter(u => u.utilityType?.hard_type === t.value),
      }))
      .filter(s => s.rows.length > 0);
    this.missingUtilityTypes = types
      .filter(t => !this.utilitySections.some(s => s.type === t.value))
      .map(t => ({value: t.value, label: t.label, icon: HardTypeMatIcon[t.value], color: t.color}));
    this.utilityPreview = this.utilitySections.flatMap(s => s.rows.map(u => ({
      id: u.id, label: u.utility_id ?? `#${u.id}`, sublabel: s.label, icon: s.icon, color: s.color,
      status: utilityStatus(u.supply_active),
    })));
  }

  private loadPlants(): void {
    this.plantService.list({asset_id: this.data.item.id}).subscribe({
      next: rows => {
        this.plants = rows;
        this.plantPreview = rows.map(p => ({
          id: p.id, label: `${p.code} — ${p.name}`, sublabel: PLANT_TYPE_LABEL[p.type],
          icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)', status: plantStatus(p.status),
        }));
      },
      error: err => console.error('Errore caricamento impianti:', err),
    });
  }

  private loadGrants(): void {
    this.grantService.search({asset_id: this.data.item.id} as never).subscribe({
      next: rows => {
        this.grants = rows;
        this.grantPreview = rows
          .filter(g => g.computed_status === 'ACTIVE' || g.computed_status === 'EXPIRING')
          .map(g => ({
            id: g.id, label: g.utilizer?.name ?? `#${g.id}`,
            sublabel: [g.kind ? KIND_LABEL[g.kind] : null, g.subject].filter(Boolean).join(' · '),
            icon: 'real_estate_agent', color: 'var(--entity-grant)', status: grantStatus(g.computed_status),
          }));
      },
      error: err => console.error('Errore caricamento contratti immobiliari:', err),
    });
  }

  addUtility(hardType: HardType): void {
    const prefill = Utility.create({
      asset_ids: [this.data.item.id],
      assets: [this.data.item],
      utility_type_id_fk: this.utilityTypeIdByHardType.get(hardType) ?? undefined,
    });
    this.navigator.createUtility(prefill).subscribe(created => {
      if (!created) return;
      // La POST non popola le relazioni: senza questo stub la nuova utenza
      // resterebbe invisibile nella sua sezione finché non si riapre.
      created.utilityType = {hard_type: hardType} as UtilityType;
      this.data.item.utilities = [...(this.data.item.utilities ?? []), created];
      this.refreshUtilities();
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (!saved) return;
      const stillLinked = saved.assets?.some(a => a.id === this.data.item.id) ?? true;
      const others = (this.data.item.utilities ?? []).filter(u => u.id !== saved.id);
      this.data.item.utilities = stillLinked ? [...others, saved] : others;
      this.refreshUtilities();
    });
  }

  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (saved) this.loadPlants();
    });
  }

  createPlant(): void {
    this.navigator.createPlant(this.data.item.id).subscribe(saved => {
      if (saved) this.loadPlants();
    });
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved) this.loadGrants();
    });
  }

  createGrant(): void {
    this.navigator.createGrant([this.data.item.id]).subscribe(saved => {
      if (saved) this.loadGrants();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const result = plainToInstance(Asset, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }
}
