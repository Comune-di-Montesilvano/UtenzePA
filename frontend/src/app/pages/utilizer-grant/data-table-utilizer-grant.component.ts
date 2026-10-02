import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilizerGrantEditDialogComponent} from './utilizer-grant-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {StringHelper} from '../../core/helpers/string.helper';
import {ExportHelper} from '../../core/helpers/export.helper';
import {
  DIRECTION_LABEL,
  formatDateIt,
  formatEuro,
  KIND_LABEL,
  STATUS_LABEL,
  statusBadge,
} from './real-estate-contract.model';

@Component({
  selector: 'app-data-table-utilizer-grant',
  standalone: true,
  imports: [
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-utilizer-grant.component.html'
})
export class DataTableUtilizerGrantComponent extends AbstractDataTableComponent<UtilizerGrant> {

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '60px'},
    {field: 'direction', header: 'Direzione', minWidth: '90px'},
    {field: 'kind', header: 'Tipo', minWidth: '130px'},
    {field: 'utilizer', header: 'Controparte', minWidth: '180px'},
    {field: 'assets', header: 'Immobili', minWidth: '180px'},
    {field: 'subject', header: 'Oggetto', minWidth: '200px'},
    {field: 'annual_rent', header: 'Canone annuo', minWidth: '120px'},
    {field: 'effective_end_date', header: 'Scadenza', minWidth: '110px'},
    {field: 'notice_deadline', header: 'Disdetta entro', minWidth: '110px'},
    {field: 'computed_status', header: 'Stato', minWidth: '110px'},
    {field: 'department', header: 'Settore', minWidth: '90px'},
    {field: 'concession_act', header: 'Atto', minWidth: '180px'},
    {field: 'registration_ref', header: 'Registrazione', minWidth: '140px'},
    {field: 'cadastral_ref', header: 'Catasto', minWidth: '140px'},
    {field: 'utilities_to_be_taken_over', header: 'Utenze da volturare', minWidth: '110px'},
  ];

  private readonly defaultVisibleFields = new Set([
    'direction', 'kind', 'utilizer', 'assets', 'subject', 'annual_rent',
    'effective_end_date', 'notice_deadline', 'computed_status',
  ]);

  private static readonly STORAGE_KEY = 'columns:real-estate-contracts';

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableUtilizerGrantComponent.STORAGE_KEY, this.allColumns, this.defaultVisibleFields
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableUtilizerGrantComponent.STORAGE_KEY, this.selectedColumns);
  }

  readonly maxDescLength = 50;
  readonly euro = formatEuro;
  readonly dateIt = formatDateIt;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  directionText(item: UtilizerGrant): string {
    return item.direction ? DIRECTION_LABEL[item.direction] : '';
  }

  kindText(item: UtilizerGrant): string {
    return item.kind ? KIND_LABEL[item.kind] : '';
  }

  statusText(item: UtilizerGrant): string {
    return item.computed_status ? STATUS_LABEL[item.computed_status] : '';
  }

  statusBadgeOf(item: UtilizerGrant): {bg: string; fg: string} {
    return statusBadge(item.computed_status ?? 'ACTIVE');
  }

  assetNames(item: UtilizerGrant): string {
    return (item.assets ?? []).map(a => a.asset_name).join(', ');
  }

  truncate(value: string | null | undefined): string {
    return StringHelper.truncateAt(value, this.maxDescLength);
  }

  protected override exportCellValue(item: UtilizerGrant, field: string): string {
    switch (field) {
      case 'direction':
        return item.direction ? DIRECTION_LABEL[item.direction] : '';
      case 'kind':
        return item.kind ? KIND_LABEL[item.kind] : '';
      case 'utilizer':
        return item.utilizer?.name ?? '';
      case 'assets':
        return this.assetNames(item);
      case 'annual_rent':
        return item.annual_rent === null || item.annual_rent === undefined
          ? '' : item.annual_rent.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      case 'effective_end_date':
      case 'notice_deadline':
        return formatDateIt(item[field]);
      case 'computed_status':
        return item.computed_status ? STATUS_LABEL[item.computed_status] : '';
      case 'utilities_to_be_taken_over':
        return ExportHelper.boolData(item.utilities_to_be_taken_over);
      default:
        return String(this.getNestedValue(item, field) ?? '');
    }
  }

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'contratti_immobiliari');
  }

  override itemInstance(): UtilizerGrant {
    return UtilizerGrant.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilizerGrantEditDialogComponent;
  }

  protected override useSheet(): boolean {
    return true;
  }


  protected override entityLabel(): string {
    return 'contratto immobiliare';
  }

  override openDeleteDialog(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina contratto immobiliare',
        message: `Eliminare il contratto immobiliare #${entity.id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: UtilizerGrant): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina contratto immobiliare',
        message: `Riattivare il contratto immobiliare #${entity.id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
