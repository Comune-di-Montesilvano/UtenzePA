import {Component, Type, ChangeDetectionStrategy, inject} from '@angular/core';
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
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {AssetEditDialogComponent} from './asset-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {cadastralUnitLabel} from './entity/cadastral-unit';
import {BrandingService} from '../../services/branding.service';
import {LEGAL_NATURE_LABEL, MEF_USAGE_LABEL} from './mef-domains';

@Component({
  selector: 'app-data-table-assets',
  standalone: true,
  imports: [ListToolbarComponent, 
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    HasRoleDirective, TruncatePipe
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-assets.component.html'
})
export class DataTableAssetsComponent extends AbstractDataTableComponent<Asset> {

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '50px'},
    {field: 'asset_name', header: 'Nome edificio', minWidth: '150px'},
    {field: 'assetNature.name', header: 'Tipologia', minWidth: '120px'},
    {field: 'assetFunction.name', header: 'Funzione', minWidth: '150px'},
    {field: 'complex.name', header: 'Complesso', minWidth: '150px'},
    {field: 'status', header: 'Stato', minWidth: '100px'},
    {field: 'ownership', header: 'Proprietà', minWidth: '100px'},
    {field: 'toponym', header: 'Toponimo', minWidth: '100px'},
    {field: 'address', header: 'Indirizzo', minWidth: '150px'},
    {field: 'civic_number', header: 'Civico', minWidth: '80px'},
    {field: 'municipality', header: 'Comune', minWidth: '150px'},
    {field: 'zip_code', header: 'CAP', minWidth: '80px'},
    {field: 'services_and_artifacts', header: 'Servizi/Manufatti', minWidth: '200px'},
    {field: 'latitude', header: 'Latitudine', minWidth: '100px'},
    {field: 'longitude', header: 'Longitudine', minWidth: '100px'},
    {field: 'cadastre', header: 'Catasto', minWidth: '160px'},
    {field: 'legal_nature', header: 'Natura giuridica', minWidth: '150px'},
    {field: 'mef.usage', header: 'Utilizzo', minWidth: '150px'},
    {field: 'mef_id', header: 'Id MEF', minWidth: '90px'},
    {field: 'area_sqm', header: 'Superficie (mq)', minWidth: '120px'},
    {field: 'associated_building', header: 'Descrizione fabbricato', minWidth: '200px'},
    {field: 'specific_details', header: 'Specifiche', minWidth: '200px'},
    {field: 'memo', header: 'Promemoria', minWidth: '200px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'id', 'asset_name', 'assetNature.name', 'assetFunction.name', 'status',
    'ownership', 'address', 'municipality'
  ]);

  // v3: catasto spostato sulle unità catastali (colonna "Catasto") e dati
  // MEF — chiave nuova perché le selezioni salvate citano colonne rimosse.
  private static readonly STORAGE_KEY = 'columns:assets:v3';

  readonly legalNatureLabel = LEGAL_NATURE_LABEL as Record<string, string>;
  readonly usageLabel = MEF_USAGE_LABEL as Record<string, string>;

  private readonly withSection = inject(BrandingService).current().cadastral_sections !== false;

  // Unità catastali in una riga: "F. 16 P. 200 sub. 3, F. 16 P. 201".
  cadastreText(item: Asset): string {
    return (item.cadastralUnits ?? []).map(u => cadastralUnitLabel(u, this.withSection)).join(', ');
  }

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
      if (property === 'cadastre') return this.cadastreText(item);
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
      case 'cadastre':
        // CSV: anche categoria e rendita di ogni unità.
        return (item.cadastralUnits ?? [])
          .map(u => [cadastralUnitLabel(u, this.withSection), u.category, u.cadastral_income != null
            ? `rendita ${Number(u.cadastral_income).toLocaleString('it-IT', {minimumFractionDigits: 2})}` : null]
            .filter(Boolean).join(' '))
          .join('; ');
      case 'legal_nature':
        return item.legal_nature ? this.legalNatureLabel[item.legal_nature] : '';
      case 'mef.usage':
        return item.mef ? this.usageLabel[item.mef.usage] : '';
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

  protected override useSheet(): boolean {
    return true;
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
