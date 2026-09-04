import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTabsModule} from '@angular/material/tabs';
import {plainToInstance} from 'class-transformer';
import {EditDialogData, EDIT_DIALOG_POSITION} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Utility} from './entity/utility.entity';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Phase} from './enum/phase.enum';
import {Asset} from '../assets/entity/asset.entity';
import {UseTypeDescription} from '../purpose/enum/use-type.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {AssetEditDialogComponent} from '../assets/asset-edit-dialog.component';
import {ContractsService} from '../contracts/contract.service';
import {ContractEditDialogComponent} from '../contracts/contract-edit-dialog.component';
import {Contract} from '../contracts/entity/contract.entity';
import {DatePipe} from '@angular/common';

// Stessa larghezza usata da MapComponent.openDetail per lo stesso dialog —
// deve poter ospitare i tab (Dati/Foto) e i gruppi affiancati dell'immobile.
const ASSET_DIALOG_WIDTH = '1150px';

@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, MatTabsModule,
    HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent, LocationMapComponent, PhotoGalleryComponent,
    DatePipe
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-edit-dialog.component.html'
})
export class UtilityEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private assetsService = inject(AssetService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private utilityTypeService = inject(UtilityTypesService);
  private contractsService = inject(ContractsService);
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;
  readonly useTypeDescription = UseTypeDescription;

  utilityTypeOptions: UtilityType[] = [];
  assetOptions: Asset[] = [];
  assetSelectOptions: TOption[] = [];
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
    costs_borne_by_id_fk: [this.resolveOnRelation('costsBorneBy', 'costs_borne_by_id_fk', this.data.item) ?? null, Validators.required],
    disconnection_ability: [this.data.item.disconnection_ability ?? ''],
    estimated_annual_consumption: [this.data.item.estimated_annual_consumption ?? 0, Validators.required],
    latitude: [this.data.item.latitude ?? ''],
    longitude: [this.data.item.longitude ?? ''],
    maintenance_management_id_fk: [this.resolveOnRelation('maintenanceManager', 'maintenance_management_id_fk', this.data.item) ?? null],
    meter_number: [this.data.item.meter_number ?? ''],
    meter_removed: [this.data.item.meter_removed ?? null],
    meter_verified: [this.data.item.meter_verified ?? null],
    notes: [this.data.item.notes ?? ''],
    phase_type_electric: [this.data.item.phase_type_electric ?? null],
    power_kw_electric: [this.data.item.power_kw_electric ?? null],
    reported_consumption_year: [this.data.item.reported_consumption_year ?? 0, Validators.required],
    actual_consumption: [this.data.item.actual_consumption ?? 0, Validators.required],
    specifications: [this.data.item.specifications ?? ''],
    supplier_address: [this.data.item.supplier_address ?? ''],
    supply_active: [this.data.item.supply_active ?? null],
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

  openNewContractDialog(): void {
    this.dialog.open(ContractEditDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      position: EDIT_DIALOG_POSITION,
      data: {mode: 'create', item: Contract.create(), preselectedUtilityIds: [this.data.item.id]},
    }).afterClosed().subscribe(result => {
      if (result) {
        this.contractsService.create(result).subscribe(() => {
          // Ricarica i contratti dell'utenza per aggiornare subito la sezione in questo dialog.
          this.contractsService.search({utility_id: this.data.item.id} as never).subscribe(
            contratti => this.data.item.contratti = contratti
          );
        });
      }
    });
  }

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    // Apre il dialog immobile SOPRA questo (stessa finestra, non una tab
    // nuova, ne' chiude il dialog contatore sottostante) — stesso pattern
    // di MapComponent.openDetail. MatDialog impila overlay multipli di suo,
    // chiudendo l'immobile si torna al contatore ancora aperto e compilato.
    this.assetsService.getById(assetId).subscribe((asset) => {
      this.dialog.open(AssetEditDialogComponent, {
        width: ASSET_DIALOG_WIDTH,
        maxWidth: ASSET_DIALOG_WIDTH,
        position: EDIT_DIALOG_POSITION,
        data: {mode: 'edit', item: asset},
      });
    });
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
