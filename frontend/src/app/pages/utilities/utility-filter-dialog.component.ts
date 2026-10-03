import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Phase} from './enum/phase.enum';
import {ExpireState} from './enum/expire-state.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {ARERA_NONE, areraGroups, areraOptionsFor, GAS_USE_OPTIONS} from './arera-category';

export interface UtilityFilterValues {
  utility_id: string | null;
  meter_number: string | null;
  supply_active: boolean | null;
  utility_type_id_fk: number | null;
  asset_id: number | null;
  supplier_id_fk: number | null;
  meter_removed: boolean | null;
  utilityState: ExpireState | null;
  costs_borne_by_id_fk: number | null;
  utility_code: string | null;
  aggregator_id_fk: number | null;
  supplier_address: string | null;
  arera_category: string | null;
  gas_use_category: string | null;
  consip_order: string | null;
  safeguard: boolean | null;
  wbs_gas_element: string | null;
  disconnectable: 'true' | 'false' | 'unknown' | null;
  maintenance_management_id_fk: number | null;
  budget_chapter_code_fk: number | null;
  power_kw_electric: string | null;
  voltage_kw_electric: string | null;
  estimated_annual_consumption: string | null;
  reported_consumption_year: string | null;
  security_deposit: number | null;
  phase_type_electric: Phase | null;
  meter_verified: boolean | null;
  specifications: string | null;
  notes: string | null;
  additional_notes: string | null;
  latitude: string | null;
  longitude: string | null;
  party_id: number | null;
  cig_contract: string | null;
  order_number: string | null;
  supply_start_date_range: (string | null)[] | null;
  supply_expiry_date_range: (string | null)[] | null;
  management_expiry_date_range: (string | null)[] | null;
  takeover_termination_date_range: (string | null)[] | null;
  water_concession_range: (string | null)[] | null;
}

@Component({
  selector: 'app-utility-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatExpansionModule, MatButtonModule,
    FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-filter-dialog.component.html'
})
export class UtilityFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityFilterDialogComponent, UtilityFilterValues | 'clear'>);
  private assetsService = inject(AssetService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private thirdPartiesService = inject(ThirdPartiesService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private utilityTypeService = inject(UtilityTypesService);
  protected data = inject<FilterDialogData<UtilityFilterValues>>(MAT_DIALOG_DATA);

  statusOptions: TOption[] = ExpireState.options();
  phaseTypeOptions: TOption[] = Phase.options();
  booleanOptions: TOption[] = [{label: 'Sì', value: true}, {label: 'No', value: false}];
  safeguardOptions: TOption[] = [{label: 'Sì', value: true}, {label: 'No', value: false}];

  utilityTypeOptions: TOption[] = [];
  private hardTypeById = new Map<number, HardType>();
  readonly areraNone = ARERA_NONE;
  readonly areraGroups = areraGroups();
  readonly gasUseOptions = GAS_USE_OPTIONS;
  readonly disconnectableFilterOptions: TOption[] = [
    {label: 'Sì', value: 'true'},
    {label: 'No', value: 'false'},
    {label: 'Non noto', value: 'unknown'},
  ];
  costsBorneByOptions: TOption[] = [];
  managementOptions: TOption[] = [];
  assetOptions: TOption[] = [];
  aggregatorOptions: TOption[] = [];
  supplierOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];
  partyOptions: TOption[] = [];

  form = this.fb.group({
    utility_id: [this.data.values.utility_id ?? ''],
    meter_number: [this.data.values.meter_number ?? ''],
    utility_code: [this.data.values.utility_code ?? ''],
    utility_type_id_fk: [this.data.values.utility_type_id_fk ?? null],
    asset_id: [this.data.values.asset_id ?? null],
    aggregator_id_fk: [this.data.values.aggregator_id_fk ?? null],
    supplier_address: [this.data.values.supplier_address ?? ''],
    latitude: [this.data.values.latitude ?? ''],
    longitude: [this.data.values.longitude ?? ''],
    power_kw_electric: [this.data.values.power_kw_electric ?? ''],
    voltage_kw_electric: [this.data.values.voltage_kw_electric ?? ''],
    phase_type_electric: [this.data.values.phase_type_electric ?? null],
    disconnectable: [this.data.values.disconnectable ?? null],
    wbs_gas_element: [this.data.values.wbs_gas_element ?? ''],
    arera_category: [this.data.values.arera_category ?? null],
    gas_use_category: [this.data.values.gas_use_category ?? null],
    supply_active: [this.data.values.supply_active ?? null],
    meter_removed: [this.data.values.meter_removed ?? null],
    meter_verified: [this.data.values.meter_verified ?? null],
    utilityState: [this.data.values.utilityState ?? null],
    safeguard: [this.data.values.safeguard ?? null],
    consip_order: [this.data.values.consip_order ?? ''],
    supplier_id_fk: [this.data.values.supplier_id_fk ?? null],
    maintenance_management_id_fk: [this.data.values.maintenance_management_id_fk ?? null],
    costs_borne_by_id_fk: [this.data.values.costs_borne_by_id_fk ?? null],
    cig_contract: [this.data.values.cig_contract ?? ''],
    order_number: [this.data.values.order_number ?? ''],
    budget_chapter_code_fk: [this.data.values.budget_chapter_code_fk ?? null],
    estimated_annual_consumption: [this.data.values.estimated_annual_consumption ?? ''],
    reported_consumption_year: [this.data.values.reported_consumption_year ?? ''],
    security_deposit: [this.data.values.security_deposit ?? null],
    party_id: [this.data.values.party_id ?? null],
    specifications: [this.data.values.specifications ?? ''],
    notes: [this.data.values.notes ?? ''],
    additional_notes: [this.data.values.additional_notes ?? ''],
  });

  // I 5 campi "_range" NON sono FormControl del form sopra: nell'originale PrimeNG erano array
  // [from, to] pilotati da un unico p-datePicker[selectionMode="range"]. Angular Material non ha
  // un equivalente diretto legato a un FormControl array-valued: si usano due
  // <input [matDatepicker]> singoli per campo, con modello locale qui sotto, assemblati in un
  // array solo in apply() — la chiave nell'oggetto restituito ("supply_start_date_range" ecc.)
  // deve comunque combaciare con quella già usata da AbstractSearchComponent.parseSearchForm()
  // e dal FormGroup di SearchUtilitiesComponent.qSearch (Task 4), non modificabile.
  supplyStartFrom: Date | null = this.toDate(this.data.values.supply_start_date_range?.[0]);
  supplyStartTo: Date | null = this.toDate(this.data.values.supply_start_date_range?.[1]);
  supplyExpiryFrom: Date | null = this.toDate(this.data.values.supply_expiry_date_range?.[0]);
  supplyExpiryTo: Date | null = this.toDate(this.data.values.supply_expiry_date_range?.[1]);
  managementExpiryFrom: Date | null = this.toDate(this.data.values.management_expiry_date_range?.[0]);
  managementExpiryTo: Date | null = this.toDate(this.data.values.management_expiry_date_range?.[1]);
  takeoverFrom: Date | null = this.toDate(this.data.values.takeover_termination_date_range?.[0]);
  takeoverTo: Date | null = this.toDate(this.data.values.takeover_termination_date_range?.[1]);
  waterConcessionFrom: Date | null = this.toDate(this.data.values.water_concession_range?.[0]);
  waterConcessionTo: Date | null = this.toDate(this.data.values.water_concession_range?.[1]);

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  private buildRange(from: Date | null, to: Date | null): (Date | null)[] | null {
    return (from || to) ? [from, to] : null;
  }

  // Tipologie del tipo filtrato; senza tipo, null = mostra i gruppi.
  areraOptionsForFilter(): TOption[] | null {
    const typeId = this.form.controls.utility_type_id_fk.value as number | null;
    const hardType = typeId ? this.hardTypeById.get(typeId) ?? null : null;
    return hardType ? areraOptionsFor(hardType) : null;
  }

  ngOnInit(): void {
    // Tipologia non ammessa dal nuovo tipo: si svuota, altrimenti resterebbe
    // applicata ma invisibile nel select (elenco vuoto senza motivo apparente).
    this.form.controls.utility_type_id_fk.valueChanges.subscribe(() => {
      const options = this.areraOptionsForFilter();
      const current = this.form.controls.arera_category.value;
      if (options && current && current !== this.areraNone && !options.some(o => o.value === current)) {
        this.form.controls.arera_category.setValue(null);
      }
    });
    this.utilityTypeService.search({deleted: false}).subscribe({
      next: data => this.utilityTypeOptions = data
        .map((t: any) => {
          this.hardTypeById.set(t.id, t.hard_type);
          return {label: t.name, value: t.id};
        })
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });

    this.costsBorneByService.search().subscribe({
      next: data => this.costsBorneByOptions = data
        .map((c: any) => ({label: c.name, value: c.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Costi a Carico di:', err)
    });

    this.maintenanceManagerService.search().subscribe({
      next: data => this.managementOptions = data
        .map((m: any) => ({label: m.code, value: m.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Gestori Manutenzione:', err)
    });

    this.assetsService.search({deleted: false}).subscribe({
      next: data => this.assetOptions = data
        .map((a: any) => ({label: a.asset_name, value: a.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Fabbricati:', err)
    });

    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: data => this.aggregatorOptions = data
        .map((a: any) => ({label: a.description ?? '', value: a.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });

    this.thirdPartiesService.search({deleted: false, roles: PartyRole.SUPPLIER} as never).subscribe({
      next: data => this.supplierOptions = data
        .map(p => ({label: partyName(p), value: p.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });

    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data
        .map((b: any) => ({label: `${b.chapter_code} - ${b.description}`, value: b.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });

    this.thirdPartiesService.search({deleted: false, roles: `${PartyRole.LESSOR},${PartyRole.TENANT}`} as never).subscribe({
      next: data => this.partyOptions = data
        .map(p => ({label: partyName(p), value: p.id}))
        .sort((a: TOption, b: TOption) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento delle controparti:', err)
    });
  }

  apply(): void {
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      ...raw,
      supply_start_date_range: this.buildRange(this.supplyStartFrom, this.supplyStartTo),
      supply_expiry_date_range: this.buildRange(this.supplyExpiryFrom, this.supplyExpiryTo),
      management_expiry_date_range: this.buildRange(this.managementExpiryFrom, this.managementExpiryTo),
      takeover_termination_date_range: this.buildRange(this.takeoverFrom, this.takeoverTo),
      water_concession_range: this.buildRange(this.waterConcessionFrom, this.waterConcessionTo),
    } as unknown as UtilityFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
