import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {AssetService} from '../assets/asset.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {FieldsetModule} from 'primeng/fieldset';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {Phase} from './enum/phase.enum';
import {ExpireState} from './enum/expire-state.enum';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilizerService} from '../utilizer/utilizer.service';
import {TOption} from '../../core/types/option.interface';
import {UtilityTypesService} from '../utility-types/utility-types.service';

@Component({
             selector: 'app-search-utilities',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               FieldsetModule
             ],
             templateUrl: './search-utilities.component.html',
             styleUrls: ['./search-utilities.component.css']
           })
export class SearchUtilitiesComponent extends AbstractSearchComponent implements OnInit {

  utilityTypeOptions: TOption[] = [];
  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];
  supplierOptions: TOption[] = [];
  costsBorneByOptions: TOption[] = [];

  statusOption: { label: string; value: ExpireState }[] = ExpireState.options();
  phaseTypeOptions: { label: string, value: Phase }[] = Phase.options();

  booleanOptions = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  budgetChapterOptions: TOption[] = [];
  managementOptions: TOption[] = [];
  aggregatorOptions: TOption[] = [];
  safeguardOptions: TOption[] = [
    {label: 'Si', value: true}, {label: 'No', value: false}
  ];

  constructor(
    private fb: FormBuilder,
    private assetsService: AssetService,
    private utilityAggregatorService: UtilityAggregatorsService,
    private suppliersService: SuppliersService,
    private budgetChapterService: BudgetChaptersService,
    private costsBorneByService: CostsBorneByService,
    private maintenanceManagerService: MaintenanceManagersService,
    private utilizerService: UtilizerService,
    private readonly utilityTypeService: UtilityTypesService
  ) {
    super();

    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        utility_id: [''],
        meter_number: [''],
        supply_active: [null],
        utility_type_id_fk: [null],
        asset_id_fk: [null],
        supplier_id_fk: [null],
        supply_expiry_date: [null],
        meter_removed: [null],
        deleted: [null],
        utilityState: [null],
        costs_borne_by_id_fk: [null],
        utility_code: [''],
        aggregator_id_fk: [null],
        supplier_address: [''],
        meter_usage_type: [''],
        consip_order: [''],
        safeguard: [null],
        wbs_gas_element: [''],
        disconnection_ability: [''],
        maintenance_management_id_fk: [null],
        budget_chapter_code_fk: [null],
        power_kw_electric: [''],
        voltage_kw_electric: [''],
        estimated_annual_consumption: [''],
        reported_consumption_year: [''],
        security_deposit: [''],
        water_concession: [null],
        supply_start_date: [null],
        management_expiry_date: [null],
        takeover_termination_date: [null],
        phase_type_electric: [null],
        meter_verified: [null],
        specifications: [''],
        notes: [''],
        additional_notes: [''],
        latitude: [''],
        longitude: [''],
        user_id_fk: [null],
        supply_start_date_range: [null],
        supply_expiry_date_range: [null],
        management_expiry_date_range: [null],
        takeover_termination_date_range: [null],
        water_concession_range: [null],
        cig_contract: [''],
        order_number: ['']
      });
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadDependencies();
  }

  loadDependencies() {

    this.loadOptions(this.utilityTypeService, 'id', 'name', {deleted: false})
        .subscribe({next: options => this.utilityTypeOptions = options});

    this.loadOptions(this.assetsService, 'asset_id', 'asset_name', {deleted: false})
        .subscribe({next: options => this.assetOptions = options});

    this.loadOptions(this.utilityAggregatorService, 'id', 'description', {deleted: false})
        .subscribe({next: options => this.aggregatorOptions = options});

    this.loadOptions(this.suppliersService, 'id', 'company_name', {deleted: false})
        .subscribe({next: options => this.supplierOptions = options});

    this.loadOptions(
      this.budgetChapterService,
      'id',
      b => `${b.chapter_code} - ${b.description}`,
      {deleted: false}
    ).subscribe({next: options => this.budgetChapterOptions = options});

    this.loadOptions(this.costsBorneByService, 'id', 'name')
        .subscribe({next: options => this.costsBorneByOptions = options});

    this.loadOptions(this.maintenanceManagerService, 'id', 'code')
        .subscribe({next: options => this.managementOptions = options});

    this.loadOptions(this.utilizerService, 'id', 'name', {deleted: false})
        .subscribe({next: options => this.utilizerOptions = options});
  }
}
