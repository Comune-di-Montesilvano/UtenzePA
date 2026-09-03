import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Asset} from './entity/asset.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {AssetEditDialogComponent} from './asset-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';

@Component({
  selector: 'app-data-table-assets',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    HasRoleDirective, FormatAmountPipe, TruncatePipe
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-assets.component.html'
})
export class DataTableAssetsComponent extends AbstractDataTableComponent<Asset> {

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'asset_name', header: 'Nome edificio', minWidth: '150px'},
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

  maxDescLength = 50;
  tabs = HardType.items();

  get displayedColumns(): string[] {
    return ['actions', 'utilities', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableAssetsComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
    this.dataSource.sortingDataAccessor = (item: Asset, property: string) => {
      const value = this.getNestedValue(item, property);
      return (value ?? '') as string | number;
    };
  }

  getUtilityCountByType(item: Asset, hardType: HardType): number {
    return item.utilities?.filter(u => u.utilityType?.hard_type === hardType).length ?? 0;
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

  override itemInstance(): Asset {
    return Asset.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Immobile';
  }

  override openDeleteDialog(entity: Asset): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Immobile',
        message: `Sei sicuro di voler eliminare l'Immobile ${entity.asset_name}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Asset): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Immobile',
        message: `Riattiva Immobile ${entity.asset_name}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
