import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {Asset} from './entity/asset.entity';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetAggregator} from '../asset-aggregator/entity/asset-aggregator.entity';
import {AssetService} from './asset.service';
import {TooltipModule} from 'primeng/tooltip';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {TOption} from '../../core/types/option.interface';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {Textarea} from 'primeng/textarea';
import {TabsModule} from 'primeng/tabs';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {Fieldset} from 'primeng/fieldset';
import {SkeletonModule} from 'primeng/skeleton';
import {MultiSelectModule} from 'primeng/multiselect';

@Component({
             selector: 'app-data-table-assets',
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
               TooltipModule,
               ReadOnlyDirective,
               OnlyNumbersDirective,
               LatitudeInputDirective,
               LongitudeInputDirective,
               Textarea,
               TabsModule,
               Fieldset,
               FormatAmountPipe,
               SkeletonModule,
               MultiSelectModule,
             ],
             templateUrl: './data-table-assets.component.html'
           })
export class DataTableAssetsComponent extends AbstractDataTableComponent<Asset> {

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'asset_name', header: 'Codice univoco', minWidth: '150px'},
    {field: 'assetAggregator.description', header: 'Tipo immobile', minWidth: '150px'},
    {field: 'category', header: 'Categoria', minWidth: '120px'},
    {field: 'ownership', header: 'Proprietà', minWidth: '100px'},
    {field: 'toponym', header: 'Toponimo', minWidth: '100px'},
    {field: 'address', header: 'Indirizzo', minWidth: '150px'},
    {field: 'civic_number', header: 'Civico', minWidth: '80px'},
    {field: 'municipality', header: 'Comune', minWidth: '150px'},
    {field: 'zip_code', header: 'CAP', minWidth: '80px'},
    {field: 'services_and_artifacts', header: 'Servizi/Manufatti', minWidth: '200px'},
    {field: 'cadastral_value', header: 'Valore catastale', minWidth: '150px'},
    {field: 'latitude', header: 'Latitudine', minWidth: '100px'},
    {field: 'longitude', header: 'Longitudine', minWidth: '100px'},
    {field: 'sheet', header: 'Foglio', minWidth: '80px'},
    {field: 'parcel', header: 'Particella (Mappale)', minWidth: '100px'},
    {field: 'subordinate', header: 'Subalterno', minWidth: '100px'},
    {field: 'area_sqm', header: 'Superficie (mq)', minWidth: '120px'},
    {field: 'associated_building', header: 'Descrizione fabbricato', minWidth: '200px'},
    {field: 'specific_details', header: 'Specifiche', minWidth: '200px'},
    {field: 'memo', header: 'Promemoria', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'asset_name', 'assetAggregator.description', 'category', 'ownership', 'address', 'municipality'
  ]);

  private static readonly STORAGE_KEY = 'columns:assets';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableAssetsComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableAssetsComponent.STORAGE_KEY, this.selectedColumns);
  }

  getFieldValue(item: Asset, field: string): unknown {
    return item[field as keyof Asset];
  }

  protected override exportCellValue(item: Asset, field: string): string {
    switch (field) {
      case 'ownership':
        return item.ownership ? 'Sì' : 'No';
      case 'cadastral_value':
        return item.cadastral_value != null
          ? item.cadastral_value.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
      case 'assetAggregator.description':
        return item.assetAggregator?.description ?? '';
      default:
        return String(this.getNestedValue(item, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'immobili');
  }

  readonly skeletonRows = Array(10).fill({});
  get skeletonCols(): number[] {
    return Array.from({length: this.selectedColumns.length + 2}, (_, i) => i);
  }
  assetAggregatorOptions: AssetAggregator[] = [];
  assetAggregatorMap: { [key: number]: AssetAggregator } = {};

  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];
  maxDescLength: number = 50;
  categoryOptions: TOption[] = [];
  toponomyOptions: TOption[] = [];
  tabs: { idx: number; label: string; icon: string; color: string; value: HardType }[] = [];

  constructor(
    screen: ScreenSizeService,
    private readonly assetAggregatorsService: AssetAggregatorsService,
    private readonly assetsService: AssetService) {
    super(screen);
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadAssetAggregators();
    this.categoryOptions = this.assetsService.categoryOptions();
    this.toponomyOptions = this.assetsService.toponymOptions();
    this.tabs = HardType.items();
  }

  loadAssetAggregators() {
    this.assetAggregatorsService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.assetAggregatorOptions = data;
          this.createAssetAggregatorMap(data);
        },
        error: (err) => console.error('Errore nel caricamento degli Asset Aggregator:', err)
      });
  }

  createAssetAggregatorMap(options: AssetAggregator[]) {
    this.assetAggregatorMap = options.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {} as { [key: number]: AssetAggregator });
  }

  override itemInstance(): Asset {
    return Asset.create();
  }

  protected override buildForm(data?: Partial<Asset>): void {
    this.form = this.fb.group(
      {
        asset_name: [data?.asset_name ?? '', Validators.required],
        asset_type_id: [this.resolveOnRelation('assetAggregator', 'asset_type_id', data), Validators.required],
        category: [data?.category ?? null],
        ownership: [data?.ownership ?? 0],
        toponym: [data?.toponym ?? null],
        address: [data?.address ?? null],
        civic_number: [data?.civic_number ?? null],
        municipality: [data?.municipality ?? null],
        zip_code: [data?.zip_code ?? null],
        services_and_artifacts: [data?.services_and_artifacts ?? null],
        latitude: [data?.latitude ?? null],
        longitude: [data?.longitude ?? null],
        cadastral_value: [data?.cadastral_value ?? null],
        sheet: [data?.sheet ?? null],
        parcel: [data?.parcel ?? null],
        subordinate: [data?.subordinate ?? null],
        area_sqm: [data?.area_sqm ?? null],
        associated_building: [data?.associated_building ?? null],
        specific_details: [data?.specific_details ?? null],
        memo: [data?.memo ?? null],
      });
  }

  override saveItem() {
    if (!this.form.valid || !this.selectedItem) return;
    Object.assign(this.selectedItem, this.form.value);
    super.saveItem();
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }

  getUtilitiesByHardType(hardType: HardType): Utility[] {
    return this.selectedItem?.utilities?.filter(
      u => u.utilityType?.hard_type === hardType
    ) ?? [];
  }

  getUtilityCountByType(asset: Asset, hardType: HardType): number {
    return asset.utilities?.filter(u => u.utilityType?.hard_type === hardType).length ?? 0;
  }

  openUtilityDetail(utility: Utility): void {
    window.open(`/utilities?selectedId=${utility.id}`, '_blank');
  }
}
