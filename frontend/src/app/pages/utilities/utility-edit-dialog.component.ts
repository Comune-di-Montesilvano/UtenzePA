import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTabsModule} from '@angular/material/tabs';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Utility} from './entity/utility.entity';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Phase} from './enum/phase.enum';
import {Asset} from '../assets/entity/asset.entity';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';
import {UseTypeDescription} from '../purpose/enum/use-type.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';

@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, MatTabsModule,
    HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent, LocationMapComponent, PhotoGalleryComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-edit-dialog.component.html'
})
export class UtilityEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
  private authService = inject(AuthService);
  private router = inject(Router);
  private assetsService = inject(AssetService);
  private suppliersService = inject(SuppliersService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private consipService = inject(ConsipAgreementService);
  private utilityTypeService = inject(UtilityTypesService);
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;
  readonly useTypeDescription = UseTypeDescription;

  utilityTypeOptions: UtilityType[] = [];
  assetOptions: Asset[] = [];
  assetSelectOptions: TOption[] = [];
  supplierOptions: Supplier[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];
  budgetChapterOptions: TOption[] = [];
  aggregatorOptions: TOption[] = [];
  costsBorneByOptions: TOption[] = [];
  maintenanceOptions: TOption[] = [];

  booleanOptions: TOption[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  phaseTypeOptions: TOption[] = [
    {label: 'Monofase', value: Phase.SINGLE_PHASE},
    {label: 'Trifase', value: Phase.THREE_PHASE},
    {label: 'N/A', value: Phase.NOT_APPLICABLE}
  ];

  // Inizializzato dall'utilityType già presente sull'item (edit) o null (create — Utility.create()
  // non popola mai utilityType, quindi qui parte sempre null in creazione: nessun reset esplicito
  // aggiuntivo necessario, il valore iniziale corretto discende direttamente dai dati in ingresso).
  selectedHardType: HardType | null = this.data.item.utilityType?.hard_type ?? null;

  get showLightFields(): boolean { return this.selectedHardType === HardType.LIGHT; }
  get showGasFields(): boolean { return this.selectedHardType === HardType.GAS; }

  // Replica locale di AbstractDataTableComponent.resolveOnRelation(), non accessibile da un
  // MatDialog standalone (non estende quella classe base) — stessa soluzione già adottata per
  // AssetEditDialogComponent nel Gruppo D. Se la relazione (es. "asset") non è popolata (FK
  // orfana o non caricata dal backend), il campo FK collegato parte null invece di mostrare un
  // id non risolvibile nella select.
  private resolveOnRelation<K extends keyof Utility>(relation: keyof Utility, prop: K, data?: Partial<Utility>): Utility[K] | null {
    return (data as any)?.[relation] != null ? ((data as any)?.[prop] ?? null) : null;
  }

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    additional_notes: [this.data.item.additional_notes ?? ''],
    aggregator_id_fk: [this.resolveOnRelation('aggregator', 'aggregator_id_fk', this.data.item) ?? null],
    asset_id_fk: [this.resolveOnRelation('asset', 'asset_id_fk', this.data.item) ?? null, Validators.required],
    budget_chapter_code_fk: [this.resolveOnRelation('budgetChapter', 'budget_chapter_code_fk', this.data.item) ?? null, Validators.required],
    cig_contract: [this.data.item.cig_contract ?? ''],
    consip_agreement_id: [this.resolveOnRelation('consipAgreement', 'consip_agreement_id', this.data.item) ?? null],
    consip_order: [this.data.item.consip_order ?? ''],
    order_number: [this.data.item.order_number ?? ''],
    costs_borne_by_id_fk: [this.resolveOnRelation('costsBorneBy', 'costs_borne_by_id_fk', this.data.item) ?? null, Validators.required],
    disconnection_ability: [this.data.item.disconnection_ability ?? ''],
    estimated_annual_consumption: [this.data.item.estimated_annual_consumption ?? 0, Validators.required],
    latitude: [this.data.item.latitude ?? ''],
    longitude: [this.data.item.longitude ?? ''],
    maintenance_management_id_fk: [this.resolveOnRelation('maintenanceManager', 'maintenance_management_id_fk', this.data.item) ?? null],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    meter_number: [this.data.item.meter_number ?? ''],
    meter_removed: [this.data.item.meter_removed ?? null],
    meter_verified: [this.data.item.meter_verified ?? null],
    notes: [this.data.item.notes ?? ''],
    phase_type_electric: [this.data.item.phase_type_electric ?? null],
    power_kw_electric: [this.data.item.power_kw_electric ?? null],
    reported_consumption_year: [this.data.item.reported_consumption_year ?? 0, Validators.required],
    actual_consumption: [this.data.item.actual_consumption ?? 0, Validators.required],
    security_deposit: [this.data.item.security_deposit ?? 0, Validators.required],
    specifications: [this.data.item.specifications ?? ''],
    supplier_address: [this.data.item.supplier_address ?? ''],
    supplier_id_fk: [this.resolveOnRelation('supplier', 'supplier_id_fk', this.data.item) ?? null],
    supply_active: [this.data.item.supply_active ?? null],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    utility_code: [this.data.item.utility_code ?? ''],
    utility_id: [{value: this.data.item.utility_id ?? '', disabled: !this.isNew}, Validators.required],
    utility_type_id_fk: [this.data.item.utility_type_id_fk ?? null, Validators.required],
    voltage_kw_electric: [this.data.item.voltage_kw_electric ?? ''],
    water_concession: [this.toDate(this.data.item.water_concession)],
    wbs_gas_element: [this.data.item.wbs_gas_element ?? ''],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetsService.search({deleted: false}).subscribe({
      next: data => {
        this.assetOptions = data.sort((a, b) => (a.asset_name ?? '').localeCompare(b.asset_name ?? ''));
        this.assetSelectOptions = this.assetOptions.map(a => ({label: a.asset_name ?? '', value: a.id}));
      },
      error: err => console.error('Errore nel caricamento dei Fabbricati:', err)
    });
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data.sort((a, b) => (a.supplier_id ?? '').localeCompare(b.supplier_id ?? '')),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.consipService.search({deleted: false}).subscribe({
      next: data => this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: data => this.aggregatorOptions = data
        .map(a => ({label: a.description ?? '', value: a.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data
        .map(b => ({label: b.description ?? '', value: b.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
    this.costsBorneByService.search().subscribe({
      next: data => this.costsBorneByOptions = data
        .map(c => ({label: c.name ?? '', value: c.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Costi a Carico di:', err)
    });
    this.maintenanceManagerService.search().subscribe({
      next: data => this.maintenanceOptions = data
        .map(m => ({label: m.code ?? '', value: m.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Gestori Manutenzione:', err)
    });
    this.utilityTypeService.search().subscribe({
      next: data => this.utilityTypeOptions = data,
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
  }

  onUtilityTypeChange(event: MatSelectChange): void {
    const selected = this.utilityTypeOptions.find(t => t.id === event.value) ?? null;
    this.selectedHardType = selected?.hard_type ?? null;
  }

  onConsipAgreementChange(event: MatSelectChange): void {
    const selectedAgreementId: number | null = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    } else {
      this.form.patchValue({supplier_id_fk: null});
    }
  }

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/building'], {queryParams: {selectedId: assetId}})
    );
    window.open(url, '_blank');
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
    // Fallback all'immobile associato: prima il suo GPS reale, poi — se
    // l'immobile non ne ha uno proprio — la sua posizione geocodificata
    // dall'indirizzo (asset.geocoded_latitude/longitude). Senza questo
    // secondo fallback un contatore collegato a un immobile solo
    // geocodificato (caso comune, mai un GPS reale inserito a mano) restava
    // con mini-mappa completamente vuota — nessun marker, nessun hint,
    // nessun modo di impostare una posizione.
    const asset = this.data.item.asset;
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
    const asset = this.data.item.asset;
    const assetLat = asset?.latitude ?? asset?.geocoded_latitude;
    const assetLon = asset?.longitude ?? asset?.geocoded_longitude;
    return isValid(assetLat) && isValid(assetLon);
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }

  save(): void {
    if (!this.form.valid) return;
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
