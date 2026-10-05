import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectChange, MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AuthService} from '../../services/auth.service';
import {Utility} from './entity/utility.entity';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType, HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Phase} from './enum/phase.enum';
import {Asset} from '../assets/entity/asset.entity';
import {areraOptionsFor, DISCONNECTABLE_OPTIONS, GAS_USE_OPTIONS} from './arera-category';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {ContractsService} from '../contracts/contract.service';
import {Contract} from '../contracts/entity/contract.entity';
import {UtilityConsumptionsTabComponent} from './consumptions/utility-consumptions-tab.component';
import {PlantService} from '../plants/plant.service';
import {PLANT_TYPE_ICON, PLANT_TYPE_LABEL, PlantStatus, PlantType} from '../plants/plant.model';
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {SupplyType, SupplyTypeDescription} from '../budget-chapters/enum/supply-type.enum';
import {CONSUMPTION_UNIT_BY_HARD_TYPE, ConsumptionSummary, formatQty} from './consumptions/consumption.model';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {assetStatus, costStatus, maintenanceStatus, plantStatus, StatusInfo, supplyContractStatus, utilityFlags, utilityStatus} from '../../core/helpers/entity-status';
import {dateIt, hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {partyName} from '../../core/helpers/party-name.helper';
import {UtilityInvoicesTabComponent} from './utility-invoices-tab.component';
import {CommitmentService} from '../contracts/commitments/commitment.service';
import {forkJoin} from 'rxjs';

// Tipi fornitura capitolo compatibili col tipo utenza; SPRAR sempre
// compatibile (capitolo multi-utenza). Solo ordinamento, nessun blocco.
const CHAPTER_COMPATIBILITY: Record<HardType, SupplyType[]> = {
  [HardType.LIGHT]: [SupplyType.ELECTRICITY],
  [HardType.GAS]: [SupplyType.GAS_SUPPLY_ONLY, SupplyType.THERMAL_MANAGEMENT],
  [HardType.WATER]: [SupplyType.WATER],
  [HardType.INTERNET]: [],
};

// Un'utenza serve almeno un immobile o un impianto (stessa regola del backend).
function atLeastOneLink(group: AbstractControl): ValidationErrors | null {
  const assets = (group.get('asset_ids')?.value ?? []) as unknown[];
  const plants = (group.get('plant_ids')?.value ?? []) as unknown[];
  return assets.length + plants.length > 0 ? null : {noLink: true};
}

// Riga impianto: dall'elenco completo, o dai dati parziali dell'utenza
// finché l'elenco non è caricato.
interface PlantRow {
  id: number;
  code: string;
  name: string;
  type: PlantType;
  status?: PlantStatus;
}


@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, MatTabsModule,
    FilterableSelectComponent, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    UtilityConsumptionsTabComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent,
    PreviewCardComponent, LinkedTableComponent, UtilityInvoicesTabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-edit-dialog.component.html'
})
export class UtilityEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
  private authService = inject(AuthService);
  private assetsService = inject(AssetService);
  private plantService = inject(PlantService);
  private budgetChapterService = inject(BudgetChaptersService);
  private commitmentService = inject(CommitmentService);
  private utilityTypeService = inject(UtilityTypesService);
  private contractsService = inject(ContractsService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly formatQty = formatQty;
  readonly HardType = HardType;

  utilityTypeOptions: UtilityType[] = [];
  assetOptions: Asset[] = [];
  assetSelectOptions: TOption[] = [];
  private allPlants: PlantRow[] = [];
  plantSelectOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];
  private budgetChapters: BudgetChapter[] = [];
  // Capitoli impegnati sui contratti aperti dell'utenza: in cima al select.
  private committedChapterIds = new Set<number>();

  booleanOptions: TOption[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  phaseTypeOptions: TOption[] = [
    {label: 'Monofase', value: Phase.SINGLE_PHASE},
    {label: 'Trifase', value: Phase.THREE_PHASE},
    {label: 'N/A', value: Phase.NOT_APPLICABLE}
  ];

  // Dall'utilityType già presente sull'item (edit) o null (create).
  selectedHardType: HardType | null = this.data.item.utilityType?.hard_type ?? null;
  readonly disconnectableOptions = DISCONNECTABLE_OPTIONS;
  readonly gasUseOptions = GAS_USE_OPTIONS;
  readonly hardTypeGas = HardType.GAS;
  areraOptions = areraOptionsFor(this.selectedHardType);

  get showLightFields(): boolean { return this.selectedHardType === HardType.LIGHT; }
  get showGasFields(): boolean { return this.selectedHardType === HardType.GAS; }

  // Se la relazione non è popolata (FK orfana o non caricata), il campo FK
  // parte null invece di mostrare un id non risolvibile nella select.
  private resolveOnRelation<K extends keyof Utility>(relation: keyof Utility, prop: K, data?: Partial<Utility>): Utility[K] | null {
    return (data as any)?.[relation] != null ? ((data as any)?.[prop] ?? null) : null;
  }

  // Data 'YYYY-MM-DD' letta come giorno locale (come plant-edit-dialog):
  // new Date('YYYY-MM-DD') è mezzanotte UTC e, rimandata al backend
  // (NormalizeDate +1 giorno), sposterebbe la data in avanti a ogni Salva.
  private toDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  form = this.fb.group({
    asset_ids: [(this.data.item.assets ?? []).map(a => a.id)],
    plant_ids: [(this.data.item.plants ?? []).map(p => p.id)],
    budget_chapter_code_fk: [this.resolveOnRelation('budgetChapter', 'budget_chapter_code_fk', this.data.item) ?? null, Validators.required],
    transferred_to_third_party_id: [this.data.item.transferred_to_third_party_id ?? null],
    transferred_on: [this.toDate(this.data.item.transferred_on)],
    arera_category: [this.data.item.arera_category ?? null],
    gas_use_category: [this.data.item.gas_use_category ?? null],
    disconnectable: [this.data.item.disconnectable ?? null],
    estimated_annual_consumption: [this.data.item.estimated_annual_consumption ?? 0, Validators.required],
    latitude: [this.data.item.latitude ?? ''],
    longitude: [this.data.item.longitude ?? ''],
    meter_number: [this.data.item.meter_number ?? ''],
    meter_removed: [this.data.item.meter_removed ?? null],
    meter_verified: [this.data.item.meter_verified ?? null],
    notes: [this.data.item.notes ?? ''],
    phase_type_electric: [this.data.item.phase_type_electric ?? null],
    power_kw_electric: [this.data.item.power_kw_electric ?? null],
    security_deposit: [this.data.item.security_deposit ?? null as number | null],
    reported_consumption_year: [this.data.item.reported_consumption_year ?? 0, Validators.required],
    supplier_address: [this.data.item.supplier_address ?? ''],
    supply_active: [this.data.item.supply_active ?? null],
    utility_code: [this.data.item.utility_code ?? ''],
    utility_id: [{value: this.data.item.utility_id ?? '', disabled: !this.isNew}, Validators.required],
    utility_type_id_fk: [this.data.item.utility_type_id_fk ?? null, Validators.required],
    voltage_kw_electric: [this.data.item.voltage_kw_electric ?? ''],
    water_concession: [this.toDate(this.data.item.water_concession)],
    wbs_gas_element: [this.data.item.wbs_gas_element ?? ''],
  }, {validators: atLeastOneLink});

  // Collegamenti: campi cache aggiornati da refreshLinks().
  contracts: Contract[] = this.data.item.contratti ?? [];
  assetRows: Asset[] = [];
  plantRows: PlantRow[] = [];
  assetPreview: PreviewItem[] = [];
  plantPreview: PreviewItem[] = [];
  contractPreview: PreviewItem[] = [];

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly plantColumns: LinkedColumn<PlantRow>[] = [
    {label: 'Codice', value: p => p.code},
    {label: 'Nome', value: p => p.name},
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
  ];
  readonly plantIconOf = (p: PlantRow): RowIcon => ({icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)'});
  readonly plantStatusOf = (p: PlantRow): StatusInfo | null => (p.status ? plantStatus(p.status) : null);

  readonly contractColumns: LinkedColumn<Contract>[] = [
    {label: 'CIG', value: c => c.cig_contract || (c.cig_exempt ? 'Escluso da CIG' : '—')},
    {label: 'Fornitore', value: c => partyName(c.supplier)},
    {label: 'Decorrenza', value: c => dateIt(c.supply_start_date)},
    {label: 'Scadenza', value: c => dateIt(c.supply_expiry_date)},
  ];
  readonly contractStatusOf = (c: Contract): StatusInfo => supplyContractStatus(c);

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.refreshLinks();
    this.loadPlants();
    this.loadAssets();
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => {
        this.budgetChapters = data;
        this.buildBudgetChapterOptions();
      },
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
    this.loadCommittedChapters();
    this.utilityTypeService.search().subscribe({
      next: data => this.utilityTypeOptions = data,
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
  }

  private loadAssets(): void {
    this.assetsService.search({deleted: false}).subscribe({
      next: data => {
        this.assetOptions = data.sort((a, b) => (a.asset_name ?? '').localeCompare(b.asset_name ?? ''));
        this.assetSelectOptions = this.assetOptions.map(a => ({label: a.asset_name ?? '', value: a.id}));
        this.refreshLinks();
      },
      error: err => console.error('Errore nel caricamento dei Fabbricati:', err)
    });
  }

  private loadPlants(): void {
    this.plantService.list().subscribe({
      next: plants => {
        this.allPlants = plants.map(p => ({id: p.id, code: p.code, name: p.name, type: p.type, status: p.status}));
        this.plantSelectOptions = plants.map(p => ({
          label: `${p.code} — ${p.name}`,
          value: p.id,
          sublabel: PLANT_TYPE_LABEL[p.type],
          searchText: `${p.code} ${p.name} ${PLANT_TYPE_LABEL[p.type]}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento impianti:', err),
    });
  }

  refreshLinks(): void {
    const assetIds = (this.form.controls.asset_ids.value ?? []) as number[];
    this.assetRows = assetIds
      .map(id => this.assetOptions.find(a => a.id === id) ?? this.data.item.assets?.find(a => a.id === id))
      .filter((a): a is Asset => !!a);
    const plantIds = (this.form.controls.plant_ids.value ?? []) as number[];
    this.plantRows = plantIds
      .map(id => this.allPlants.find(p => p.id === id) ?? this.data.item.plants?.find(p => p.id === id))
      .filter((p): p is PlantRow => !!p);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
    this.plantPreview = this.plantRows.map(p => ({
      id: p.id, label: `${p.code} — ${p.name}`, sublabel: PLANT_TYPE_LABEL[p.type],
      icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)', status: p.status ? plantStatus(p.status) : null,
    }));
    this.contractPreview = this.contracts
      .filter(c => supplyContractStatus(c).tone === 'ok')
      .map(c => ({
        id: c.id, label: c.cig_contract || 'CIG non specificato', sublabel: partyName(c.supplier) || undefined,
        icon: 'description', color: 'var(--entity-supply-contract)', status: supplyContractStatus(c),
      }));
  }

  // Header
  headerIcon(): string {
    return this.selectedHardType ? HardTypeMatIcon[this.selectedHardType] : 'electric_meter';
  }

  headerColor(): string {
    return this.selectedHardType ? HardTypeColor[this.selectedHardType] : 'var(--entity-utility)';
  }

  titleText(): string {
    return this.isNew ? 'Nuova utenza' : (this.form.controls.utility_id.value || 'Utenza');
  }

  subtitleText(): string {
    const type = this.utilityTypeOptions.find(t => t.id === this.form.controls.utility_type_id_fk.value)?.name;
    return [type, this.form.controls.supplier_address.value].filter(Boolean).join(' · ');
  }

  statusInfo(): StatusInfo {
    return utilityStatus(this.form.controls.supply_active.value);
  }

  flags(): StatusInfo[] {
    return utilityFlags(this.form.controls.meter_removed.value, this.form.controls.meter_verified.value);
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  linkError(): boolean {
    const c = this.form.controls;
    return this.form.hasError('noLink') && (c.asset_ids.touched || c.plant_ids.touched);
  }

  hasCurrentContract(): boolean {
    return this.contractPreview.length > 0;
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  // Collegamenti (form control → salvati con "Salva")
  private setIds(control: 'asset_ids' | 'plant_ids', ids: number[]): void {
    const c = this.form.controls[control];
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    this.setIds('asset_ids', [...((this.form.controls.asset_ids.value ?? []) as number[]), id]);
  }

  unlinkAsset(id: number): void {
    this.setIds('asset_ids', ((this.form.controls.asset_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  addPlant(id: number): void {
    this.setIds('plant_ids', [...((this.form.controls.plant_ids.value ?? []) as number[]), id]);
  }

  unlinkPlant(id: number): void {
    this.setIds('plant_ids', ((this.form.controls.plant_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.loadAssets();
    });
  }

  // L'impianto salva da sé anche i suoi collegamenti alle utenze: dopo il
  // salvataggio riallinea plant_ids, altrimenti "Salva" qui sovrascriverebbe
  // la modifica fatta nella scheda impianto.
  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (!saved) return;
      this.loadPlants();
      if (this.isNew) return;
      this.plantService.get(id).subscribe(plant => this.syncPlantLink(id, plant.utilities.some(u => u.id === this.data.item.id)));
    });
  }

  // Impianti come letti dal server: distinguono un collegamento aggiunto/tolto
  // qui e non ancora salvato da uno cambiato nella scheda impianto.
  private savedPlantIds = new Set((this.data.item.plants ?? []).map(p => p.id));

  private syncPlantLink(plantId: number, linked: boolean): void {
    const ids = (this.form.controls.plant_ids.value ?? []) as number[];
    const has = ids.includes(plantId);
    const toggledHere = has !== this.savedPlantIds.has(plantId);
    if (linked) this.savedPlantIds.add(plantId);
    else this.savedPlantIds.delete(plantId);
    // Modifica fatta qui e non ancora salvata: vince quella.
    if (toggledHere || linked === has) return;
    this.form.controls.plant_ids.setValue(linked ? [...ids, plantId] : ids.filter(x => x !== plantId));
    this.refreshLinks();
  }

  openContract(id: number): void {
    this.navigator.openSupplyContract(id).subscribe(saved => {
      if (saved) this.reloadContracts();
    });
  }

  newContract(): void {
    this.navigator.createSupplyContract([this.data.item.id]).subscribe(saved => {
      if (saved) this.reloadContracts();
    });
  }

  private reloadContracts(): void {
    this.contractsService.search({utility_id: this.data.item.id} as never).subscribe(contracts => {
      this.contracts = contracts;
      this.data.item.contratti = contracts;
      this.refreshLinks();
      this.loadCommittedChapters();
    });
  }

  onUtilityTypeChange(event: MatSelectChange): void {
    const selected = this.utilityTypeOptions.find(t => t.id === event.value) ?? null;
    this.selectedHardType = selected?.hard_type ?? null;
    this.areraOptions = areraOptionsFor(this.selectedHardType);
    // Tipologia non più ammessa per il nuovo tipo: si svuota (il backend
    // rifiuterebbe il salvataggio).
    const current = this.form.controls.arera_category.value;
    if (current && !this.areraOptions.some(o => o.value === current)) {
      this.form.controls.arera_category.setValue(null);
    }
    // La categoria d'uso esiste solo per il gas.
    if (this.selectedHardType !== HardType.GAS) {
      this.form.controls.gas_use_category.setValue(null);
    }
    this.buildBudgetChapterOptions();
  }

  private loadCommittedChapters(): void {
    const open = this.contracts.filter(c => !c.closed);
    if (!open.length) return;
    forkJoin(open.map(c => this.commitmentService.list(c.id))).subscribe({
      next: lists => {
        this.committedChapterIds = new Set(lists.flat().map(c => c.budget_chapter_id_fk));
        this.buildBudgetChapterOptions();
      },
      error: err => console.error('Errore nel caricamento degli impegni:', err)
    });
  }

  private buildBudgetChapterOptions(): void {
    const compatible = (c: BudgetChapter) =>
      this.selectedHardType === null ||
      c.supply_type === SupplyType.SPRAR_UTILITIES ||
      CHAPTER_COMPATIBILITY[this.selectedHardType].includes(c.supply_type);
    const label = (c: BudgetChapter) => `${c.chapter_code}/${c.article ?? 0} — ${c.description ?? ''}`.trim();
    const committed = (c: BudgetChapter) => this.committedChapterIds.has(c.id);
    this.budgetChapterOptions = [...this.budgetChapters]
      .sort((a, b) =>
        Number(committed(b)) - Number(committed(a)) ||
        Number(compatible(b)) - Number(compatible(a)) ||
        label(a).localeCompare(label(b)))
      .map(c => {
        const parts = [
          committed(c) ? 'impegnato sui contratti dell’utenza' : null,
          c.pdc ? `PDC ${c.pdc}` : null,
          SupplyTypeDescription[c.supply_type] ?? null,
          compatible(c) ? null : 'tipo fornitura diverso dall’utenza',
        ].filter(Boolean);
        return {
          label: label(c),
          value: c.id,
          icon: committed(c) ? 'verified' : undefined,
          sublabel: parts.join(' · '),
          searchText: `${label(c)} ${c.pdc ?? ''}`,
        };
      });
  }

  get consumptionUnit(): string | null {
    return this.selectedHardType ? CONSUMPTION_UNIT_BY_HARD_TYPE[this.selectedHardType] : null;
  }

  estimateHint(): string {
    switch (this.data.item.estimated_consumption_source) {
      case 'MANUAL': {
        const setAt = this.data.item.estimated_consumption_set_at;
        if (!setAt) return 'Inserita manualmente';
        const until = new Date(setAt);
        until.setMonth(until.getMonth() + 12);
        return until > new Date()
          ? `Manuale, valida fino al ${until.toLocaleDateString('it-IT')}`
          : 'Manuale scaduta: verrà sostituita dallo storico consumi';
      }
      case 'HISTORY': return 'Calcolata dallo storico consumi';
      default: return 'Metti 0 per calcolarla dallo storico consumi';
    }
  }

  navigateToMaps(lat: string | null | undefined, lon: string | null | undefined): void {
    if (lat == null || lon == null) return;
    window.open(`https://www.google.com/maps/@${lat},${lon},15z?q=${lat},${lon}`, '_blank');
  }

  resolveMapCoordsFromForm(): { lat: string; lon: string } | null {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return {lat, lon};
    // Fallback all'immobile associato: prima il GPS reale, poi la posizione
    // geocodificata dall'indirizzo (caso comune: nessun GPS inserito a mano).
    const asset = this.primaryAsset();
    const assetLat = asset?.latitude ?? asset?.geocoded_latitude;
    const assetLon = asset?.longitude ?? asset?.geocoded_longitude;
    if (isValid(assetLat) && isValid(assetLon)) return {lat: assetLat, lon: assetLon};
    return null;
  }

  isMapCoordsFromAsset(): boolean {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return false;
    const asset = this.primaryAsset();
    const assetLat = asset?.latitude ?? asset?.geocoded_latitude;
    const assetLon = asset?.longitude ?? asset?.geocoded_longitude;
    return isValid(assetLat) && isValid(assetLon);
  }

  // Primo immobile selezionato che ha una posizione (GPS reale o geocodificata).
  private primaryAsset(): Asset | undefined {
    return this.assetRows.find(a => (a.latitude ?? a.geocoded_latitude) && (a.longitude ?? a.geocoded_longitude)) ?? this.assetRows[0];
  }

  // A carico di: stato calcolato dal backend sui dati salvati (si aggiorna
  // dopo Salva); la voltura si segna nei due campi del form.
  readonly costInfo = this.data.item.cost_info;
  readonly costStatusInfo = costStatus(this.data.item.cost_info);
  // Manutenzione: calcolata dal backend sui contratti salvati (si aggiorna dopo il Salva).
  readonly maintenanceInfo = this.data.item.maintenance_info;
  readonly maintenanceStatusInfo = maintenanceStatus(this.data.item.maintenance_info);
  // Soggetti a cui volturare: parti di tutti i contratti attivi più
  // l'intestatario attuale (anche se non ha più un contratto).
  readonly transferOptions: TOption[] = (() => {
    const opts = new Map<number, string>();
    for (const p of this.costInfo?.active_parties ?? []) opts.set(p.third_party_id, p.name);
    if (this.costInfo?.transferred_to) opts.set(this.costInfo.transferred_to.id, this.costInfo.transferred_to.name);
    return [...opts].map(([value, label]) => ({value, label}));
  })();

  markTransferredToday(): void {
    const parties = this.costInfo?.parties ?? [];
    if (parties.length !== 1) return;
    // Mezzanotte locale, come il datepicker: il backend (NormalizeDate) corregge lo scarto UTC.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form.patchValue({transferred_to_third_party_id: parties[0].third_party_id, transferred_on: today});
    this.form.markAsDirty();
  }

  recoverToComune(): void {
    this.form.patchValue({transferred_to_third_party_id: null, transferred_on: null});
    this.form.markAsDirty();
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe();
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }

  // Dopo una modifica alle rilevazioni il backend ha già ricalcolato
  // effettivo/stima: allinea dati mostrati e form. La stima nel form si
  // aggiorna solo se l'utente non l'ha toccata — altrimenti "Salva"
  // rimanderebbe il vecchio valore come modificato e la marcherebbe manuale.
  onConsumptionSummary(summary: ConsumptionSummary): void {
    this.data.item.actual_consumption = summary.actual_consumption;
    this.data.item.actual_consumption_coverage_days = summary.coverage_days;
    this.data.item.estimated_consumption_source = summary.estimated_source;
    this.data.item.estimated_annual_consumption = summary.estimated_annual_consumption;
    this.data.item.estimated_consumption_set_at = summary.estimated_set_at;
    const control = this.form.controls.estimated_annual_consumption;
    if (control.pristine) {
      control.setValue(summary.estimated_annual_consumption);
      control.markAsPristine();
    }
    // Una lettura con matricola nuova aggiorna la matricola dell'utenza:
    // senza riallineare il form, "Salva" la riporterebbe a quella vecchia.
    this.data.item.meter_number = summary.meter_number ?? undefined;
    const meter = this.form.controls.meter_number;
    if (meter.pristine) {
      meter.setValue(summary.meter_number ?? '');
      meter.markAsPristine();
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const result = plainToInstance(Utility, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
