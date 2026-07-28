import {AfterViewInit, Component, OnChanges, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router} from '@angular/router';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectChangeEvent, SelectModule} from 'primeng/select';
import {MultiSelectModule} from 'primeng/multiselect';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {AssetService} from '../assets/asset.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {UtilityAggregator} from '../utility-aggregator/entity/utility-aggregator.entity';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {Fieldset} from 'primeng/fieldset';
import {Textarea} from 'primeng/textarea';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';
import {Utility} from './entity/utility.entity';
import {Phase} from './enum/phase.enum';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {UseTypeDescription} from '../purpose/enum/use-type.enum';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {InputGroupAddon} from 'primeng/inputgroupaddon';
import {InputGroup} from 'primeng/inputgroup';
import {Asset} from '../assets/entity/asset.entity';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {TOption} from '../../core/types/option.interface';
import {ProgressSpinnerModule} from 'primeng/progressspinner';
import {SkeletonModule} from 'primeng/skeleton';
import {Badge} from 'primeng/badge';
import {ExportHelper} from '../../core/helpers/export.helper';

@Component({
             selector: 'app-data-table-utilities',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               FormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               HasRoleDirective,
               InputTextModule,
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               TooltipModule,
               ReadOnlyDirective,
               Fieldset,
               Textarea,
               InputGroupAddon,
               InputGroup,
               TruncatePipe,
               ProgressSpinnerModule,
               SkeletonModule,
               Badge,
               MultiSelectModule,
             ],
             templateUrl: './data-table-utilities.component.html'
           })
export class DataTableUtilitiesComponent extends AbstractDataTableComponent<Utility> implements OnChanges, OnInit, AfterViewInit {

  ngAfterViewInit() {
    this.screen.updateMinHeight();
  }

  maxDescLength = 50;
  readonly useTypeDescription = UseTypeDescription;

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'utility_id', header: 'Codice (POD/PDR/Matricola)', minWidth: '180px'},
    {field: 'utilityType.name', header: 'Tipo Utenza', minWidth: '150px'},
    {field: 'supplier.company_name', header: 'Fornitore', minWidth: '150px'},
    {field: 'asset.asset_name', header: 'Fabbricato Associato', minWidth: '150px'},
    {field: 'costsBorneBy.name', header: 'Costi a Carico di', minWidth: '150px'},
    {field: 'aggregator.description', header: 'ID Aggregato', minWidth: '200px'},
    {field: 'meter_number', header: 'Numero Contatore', minWidth: '120px'},
    {field: 'utility_code', header: 'Codice Utenza o Cliente', minWidth: '150px'},
    {field: 'supplier_address', header: 'Indirizzo Fornitura', minWidth: '150px'},
    {field: 'utilityType.description', header: 'Tipo Uso Contatore', minWidth: '120px'},
    {field: 'consipAgreement.name', header: 'Convenzione CONSIP', minWidth: '120px'},
    {field: 'consip_order', header: 'Ordine CONSIP', minWidth: '120px'},
    {field: 'cig_contract', header: 'CIG Contratto', minWidth: '150px'},
    {field: 'order_number', header: 'Numero ordine', minWidth: '150px'},
    {field: 'wbs_gas_element', header: 'Elemento WBS Gas', minWidth: '120px'},
    {field: 'power_kw_electric', header: 'Potenza (kW)', minWidth: '100px'},
    {field: 'voltage_kw_electric', header: 'Tensione (V / kV)', minWidth: '100px'},
    {field: 'phase_type_electric', header: 'Tipo Fase', minWidth: '100px'},
    {field: 'estimated_annual_consumption', header: 'Consumo annuo presunto', minWidth: '150px'},
    {field: 'reported_consumption_year', header: 'Consumo annuo comunicato', minWidth: '150px'},
    {field: 'actual_consumption', header: 'Consumo effettivo', minWidth: '150px'},
    {field: 'security_deposit', header: 'Deposito Cauzionale', minWidth: '120px'},
    {field: 'supply_active', header: 'Fornitura Attiva', minWidth: '120px'},
    {field: 'meter_removed', header: 'Contatore Rimosso', minWidth: '120px'},
    {field: 'meter_verified', header: 'Contatore Verificato', minWidth: '120px'},
    {field: 'water_concession', header: 'Concessione acqua', minWidth: '120px'},
    {field: 'supply_start_date', header: 'Decorrenza fornitura', minWidth: '120px'},
    {field: 'supply_expiry_date', header: 'Scadenza affidamento', minWidth: '120px'},
    {field: 'management_expiry_date', header: 'Scadenza Gestione', minWidth: '120px'},
    {field: 'takeover_termination_date', header: 'Data voltura/cessazione', minWidth: '120px'},
    {field: 'disconnection_ability', header: 'Disalimentabilità', minWidth: '120px'},
    {field: 'maintenanceManager.code', header: 'Gestione Manutenzione', minWidth: '120px'},
    {field: 'budgetChapter.description', header: 'Capitolo di Spesa', minWidth: '200px'},
    {field: 'latitude', header: 'Latitudine', minWidth: '100px'},
    {field: 'longitude', header: 'Longitudine', minWidth: '100px'},
    {field: 'asset.utilizer', header: 'Utilizzatori', minWidth: '180px'},
    {field: 'specifications', header: 'Specifiche', minWidth: '200px'},
    {field: 'notes', header: 'Note', minWidth: '200px'},
    {field: 'additional_notes', header: 'Note Aggiuntive', minWidth: '200px'},
    {field: 'expiryStatus', header: 'Stato', minWidth: '120px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'utility_id', 'utilityType.name', 'supplier.company_name',
    'asset.asset_name', 'costsBorneBy.name', 'supply_active', 'supply_expiry_date', 'expiryStatus',
  ]);

  private static readonly STORAGE_KEY = 'columns:utilities';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableUtilitiesComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableUtilitiesComponent.STORAGE_KEY, this.selectedColumns);
  }

  readonly skeletonRows = Array(10).fill({});

  get skeletonCols(): number[] {
    return Array.from({length: this.selectedColumns.length + 2}, (_, i) => i);
  }

  override getNestedValue(obj: Utility, path: string): unknown {
    return path.split('.').reduce((acc: unknown, key: string) =>
                                    acc != null ? (acc as Record<string, unknown>)[key] : null, obj);
  }

  protected override exportCellValue(utility: Utility, field: string): string {
    switch (field) {
      case 'supply_active':
        return ExportHelper.boolData(utility.supply_active);
      case 'meter_removed':
        return ExportHelper.boolData(utility.meter_removed);
      case 'meter_verified':
        return ExportHelper.boolData(utility.meter_verified);
      case 'water_concession':
        return ExportHelper.formatDate(utility.water_concession);
      case 'supply_start_date':
        return ExportHelper.formatDate(utility.supply_start_date);
      case 'supply_expiry_date':
        return ExportHelper.formatDate(utility.supply_expiry_date);
      case 'management_expiry_date':
        return ExportHelper.formatDate(utility.management_expiry_date);
      case 'takeover_termination_date':
        return ExportHelper.formatDate(utility.takeover_termination_date);
      case 'security_deposit':
        return utility.security_deposit != null ? this.formatAmount(utility.security_deposit) : '';
      case 'aggregator.description':
        return utility.aggregator_id_fk != null
          ? (this.utilityAggregatorMap[utility.aggregator_id_fk]?.description ?? '')
          : '';
      case 'budgetChapter.description':
        return utility.budgetChapter?.label ?? '';
      case 'asset.utilizer':
        return this.getUtilizersNames(utility);
      case 'expiryStatus':
        return this.getLabel(utility.expiryStatus ?? null);
      default:
        return String(this.getNestedValue(utility, field) ?? '');
    }
  }

  utilityTypeOptions!: UtilityType[];

  selectedHardType: HardType | null = null;

  get showLightFields(): boolean { return this.selectedHardType === HardType.LIGHT; }
  get showGasFields(): boolean { return this.selectedHardType === HardType.GAS; }
  assetOptions: Asset[] = [];

  supplierOptions: Supplier[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];

  booleanOptions: TOption[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  phaseTypeOptions: TOption[] = [
    {label: 'Monofase', value: Phase.SINGLE_PHASE},
    {label: 'Trifase', value: Phase.THREE_PHASE},
    {label: 'N/A', value: Phase.NOT_APPLICABLE}
  ];

  budgetChapterOptions: TOption[] = [];

  aggregatorOptions: TOption[] = [];

  costsBorneByOptions: TOption[] = [];

  maintenanceOptions: TOption[] = [];

  utilityAggregatorMap: { [key: number]: UtilityAggregator } = {};

  constructor(screen: ScreenSizeService,
              private readonly router: Router,
              private readonly assetsService: AssetService,
              private readonly suppliersService: SuppliersService,
              private readonly utilityAggregatorService: UtilityAggregatorsService,
              private readonly budgetChapterService: BudgetChaptersService,
              private readonly costsBorneByService: CostsBorneByService,
              private readonly maintenanceManagerService: MaintenanceManagersService,
              private readonly consipService: ConsipAgreementService,
              private readonly utilityTypeService: UtilityTypesService) {
    super(screen);
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'utenze');
  }

  getUtilizersNames(utility: Utility): string {
    return utility.asset?.utilizerGrants?.map(u => u.utilizer?.name).join(', ') ?? '';
  }

  navigateToAsset(assetId: number | null | undefined) {
    if (!assetId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/building'], {queryParams: {selectedId: assetId}})
    );
    window.open(url, '_blank');
  }

  navigateToMaps(lat: string | null | undefined, lon: string | null | undefined) {
    if (lat == null || lon == null) return;
    const url = `https://www.google.com/maps/@${lat},${lon},15z?q=${lat},${lon}`;
    window.open(url, '_blank');
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadDependencies();
  }

  onConsipAgreementChange(event: any) {
    const selectedAgreementId: number = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    } else {
      this.form.patchValue({supplier_id_fk: null});
    }
  }

  resolveMapCoordsFromForm(): { lat: string; lon: string } | null {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    if (this.form) {
      const lat = this.form.controls['latitude']?.value;
      const lon = this.form.controls['longitude']?.value;
      if (isValid(lat) && isValid(lon)) return {lat, lon};
    }
    const assetLat = this.selectedItem?.asset?.latitude;
    const assetLon = this.selectedItem?.asset?.longitude;
    if (isValid(assetLat) && isValid(assetLon)) return {lat: assetLat, lon: assetLon};
    return null;
  }

  isMapCoordsFromAsset(): boolean {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    if (this.form) {
      const lat = this.form.controls['latitude']?.value;
      const lon = this.form.controls['longitude']?.value;
      if (isValid(lat) && isValid(lon)) return false;
    }
    return isValid(this.selectedItem?.asset?.latitude) && isValid(this.selectedItem?.asset?.longitude);
  }

  labels: { [key: string]: string } = {
    ACTIVE: 'Attiva',
    EXPIRING: 'In Scadenza',
    EXPIRED: 'Scaduta'
  };

  getLabel(status: string | null): string {
    if (!status) return '';
    return this.labels[status] ?? '';
  }

  customSort(event: any) {
    const getNestedValue = (obj: any, path: string): any =>
      path.split('.').reduce((acc, key) => acc?.[key], obj);

    if (event.field === 'asset.utilizer') {
      event.data.sort((a: Utility, b: Utility) => {
        const la = this.getUtilizersNames(a).toLowerCase();
        const lb = this.getUtilizersNames(b).toLowerCase();
        return event.order * la.localeCompare(lb, 'it');
      });
      return;
    }

    event.data.sort((a: any, b: any) => {
      const v1 = getNestedValue(a, event.field);
      const v2 = getNestedValue(b, event.field);

      if (v1 == null && v2 == null) return 0;
      if (v1 == null) return event.order;
      if (v2 == null) return -event.order;

      if (typeof v1 === 'string' && typeof v2 === 'string') {
        return event.order * v1.localeCompare(v2, 'it');
      }

      const n1 = Number(v1);
      const n2 = Number(v2);
      if (!isNaN(n1) && !isNaN(n2)) {
        return event.order * (n1 - n2);
      }

      return event.order * String(v1).localeCompare(String(v2), 'it');
    });
  }

  formatAmount(amount: string | number): string {
    if (typeof amount === 'string') {
      amount = Number(amount);
    }
    return amount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  loadDependencies() {

    this.assetsService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.assetOptions = data.sort((a, b) => (a.asset_name ?? '').localeCompare(b.asset_name ?? ''));
        },
        error: (err) => {
          console.error('Errore nel caricamento dei Fabbricati:', err);
        }
      });

    this.suppliersService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.supplierOptions = data.sort((a, b) => (a.supplier_id ?? '').localeCompare(b.supplier_id ?? ''));
        },
        error: (err) => {
          console.error('Errore nel caricamento dei fornitori:', err);
        }
      });

    this.consipService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        },
        error: (err) => {
          console.error('Errore nel caricamento delle convenzioni CONSIP:', err);
        }
      }
    );

    this.utilityAggregatorService.search({deleted: false}).subscribe(
      {
        next: (data: any[]) => {
          this.aggregatorOptions = data;
          this.createUtilityAggregatorMap(data);
        },
        error: (err) => {
          console.error('Errore nel caricamento degli Asset:', err);
        }
      });

    this.budgetChapterService.search({deleted: false}).subscribe(
      {
        next: (data: any[]) => {
          this.budgetChapterOptions = data;
        },
        error: (err) => {
          console.error('Errore nel caricamento:', err);
        }
      });

    this.maintenanceManagerService.search().subscribe(
      {
        next: (data: any[]) => {
          this.maintenanceOptions = data;
        },
        error: (err) => {
          console.error('Errore nel caricamento maintenance:', err);
        }
      });

    this.costsBorneByService.search().subscribe(
      {
        next: (data: any[]) => {
          this.costsBorneByOptions = data;
        },
        error: (err) => {
          console.error('Errore nel caricamento:', err);
        }
      });

    this.utilityTypeService.search().subscribe(
      {
        next: (data: any[]) => {
          this.utilityTypeOptions = data;
        },
        error: (err) => console.error('Errore nel caricamento:', err)
      }
    )
  }

  createUtilityAggregatorMap(options: UtilityAggregator[]) {
    this.utilityAggregatorMap = options.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {} as { [key: number]: UtilityAggregator });
  }

  override itemInstance(): Utility {
    return Utility.create();
  }

  protected override buildForm(data?: Partial<Utility>): void {
    const toDate = (v: any) => v ? new Date(v) : null;
    this.form = this.fb.group(
      {
        additional_notes: [data?.additional_notes ?? ''],
        aggregator_id_fk: [this.resolveOnRelation('aggregator', 'aggregator_id_fk', data) ?? null],
        asset_id_fk: [this.resolveOnRelation('asset', 'asset_id_fk', data) ?? null, Validators.required],
        budget_chapter_code_fk: [this.resolveOnRelation('budgetChapter', 'budget_chapter_code_fk', data) ?? null, Validators.required],
        cig_contract: [data?.cig_contract ?? ''],
        consip_agreement_id: [this.resolveOnRelation('consipAgreement', 'consip_agreement_id', data) ?? null],
        consip_order: [data?.consip_order ?? ''],
        order_number: [data?.order_number ?? ''],
        costs_borne_by_id_fk: [this.resolveOnRelation('costsBorneBy', 'costs_borne_by_id_fk', data) ?? null, Validators.required],
        disconnection_ability: [data?.disconnection_ability ?? ''],
        estimated_annual_consumption: [data?.estimated_annual_consumption ?? 0, Validators.required],
        latitude: [data?.latitude ?? ''],
        longitude: [data?.longitude ?? ''],
        maintenance_management_id_fk: [this.resolveOnRelation('maintenanceManager', 'maintenance_management_id_fk', data) ?? null],
        management_expiry_date: [toDate(data?.management_expiry_date)],
        meter_number: [data?.meter_number ?? ''],
        meter_removed: [data?.meter_removed ?? null],
        meter_verified: [data?.meter_verified ?? null],
        notes: [data?.notes ?? ''],
        phase_type_electric: [data?.phase_type_electric ?? null],
        power_kw_electric: [data?.power_kw_electric ?? null],
        reported_consumption_year: [data?.reported_consumption_year ?? 0, Validators.required],
        actual_consumption: [data?.actual_consumption ?? 0, Validators.required],
        security_deposit: [data?.security_deposit ?? 0, Validators.required],
        specifications: [data?.specifications ?? ''],
        supplier_address: [data?.supplier_address ?? ''],
        supplier_id_fk: [this.resolveOnRelation('supplier', 'supplier_id_fk', data) ?? null],
        supply_active: [data?.supply_active ?? null],
        supply_expiry_date: [toDate(data?.supply_expiry_date)],
        supply_start_date: [toDate(data?.supply_start_date)],
        takeover_termination_date: [toDate(data?.takeover_termination_date)],
        utility_code: [data?.utility_code ?? ''],
        utility_id: [{value: data?.utility_id ?? '', disabled: !this.isNew}, Validators.required],
        utility_type_id_fk: [data?.utility_type_id_fk ?? null, Validators.required],
        voltage_kw_electric: [data?.voltage_kw_electric ?? ''],
        water_concession: [toDate(data?.water_concession)],
        wbs_gas_element: [data?.wbs_gas_element ?? ''],
      });
  }

  override openEditDialog(utility: Utility) {
    const resolvedCostsBorneById =
      utility.costsBorneBy?.id != null ? Number(utility.costsBorneBy.id) :
        utility.costs_borne_by_id_fk != null ? Number(utility.costs_borne_by_id_fk) : null;
    const enriched = {...utility, costs_borne_by_id_fk: resolvedCostsBorneById};
    this.selectedItem = enriched as Utility;
    this.isNew = false;
    this.selectedHardType = utility.utilityType?.hard_type ?? null;
    this.buildForm(enriched);
    this.editDialogVisible = true;
  }


  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }

  onUtilityTypeChange(event: SelectChangeEvent) {
    const selected = this.utilityTypeOptions?.find(t => t.id === event.value) ?? null;
    this.selectedHardType = selected?.hard_type ?? null;
  }
}

