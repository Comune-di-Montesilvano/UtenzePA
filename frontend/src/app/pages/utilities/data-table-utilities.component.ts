import {Component, Type} from '@angular/core';
import {Router} from '@angular/router';
import {DatePipe} from '@angular/common';
import {MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
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
import {Utility} from './entity/utility.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {UtilityEditDialogComponent} from './utility-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {UtilityAggregator} from '../utility-aggregator/entity/utility-aggregator.entity';
import {ExpireState} from './enum/expire-state.enum';
import {ExportHelper} from '../../core/helpers/export.helper';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';

@Component({
  selector: 'app-data-table-utilities',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, MatSelectModule, MatFormFieldModule, FormsModule,
    HasRoleDirective, TruncatePipe, FormatAmountPipe, DatePipe
  ],
  templateUrl: './data-table-utilities.component.html'
})
export class DataTableUtilitiesComponent extends AbstractDataTableComponent<Utility> {

  maxDescLength = 50;

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

  get displayedColumns(): string[] {
    return ['actions', 'statusBadge', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableUtilitiesComponent.STORAGE_KEY, this.selectedColumns);
  }

  utilityAggregatorMap: { [key: number]: UtilityAggregator } = {};

  constructor(
    screen: ScreenSizeService,
    private readonly router: Router,
    private readonly utilityAggregatorService: UtilityAggregatorsService
  ) {
    super(screen);
    // Custom sort fedele all'originale PrimeNG customSort(event): path annidati (es.
    // "utilityType.name") + confronto stringhe con localeCompare('it') + fallback numerico, con
    // caso speciale per la colonna virtuale "asset.utilizer" (ordina sulla stringa concatenata
    // dei nomi utilizzatori, non su un campo diretto dell'entity — la stessa logica usata da
    // exportCellValue/getUtilizersNames più sotto). MatTableDataSource.sortingDataAccessor
    // restituisce un solo valore per colonna e non può applicare un comparator locale-aware a due
    // argomenti: si sovrascrive sortData, l'unico hook che riceve l'intero array e un comparator
    // a due argomenti (stesso pattern di DataTableInvoicesComponent, Gruppo D).
    this.dataSource.sortData = (data: Utility[], sort: MatSort): Utility[] => {
      const active = sort.active;
      const direction = sort.direction;
      if (!active || direction === '') return data;
      const order = direction === 'asc' ? 1 : -1;

      if (active === 'asset.utilizer') {
        return [...data].sort((a, b) =>
          order * this.getUtilizersNames(a).toLowerCase().localeCompare(this.getUtilizersNames(b).toLowerCase(), 'it')
        );
      }

      const getVal = (obj: any, path: string): any =>
        path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
      return [...data].sort((a, b) => {
        const v1 = getVal(a, active);
        const v2 = getVal(b, active);
        if (v1 == null && v2 == null) return 0;
        if (v1 == null) return order;
        if (v2 == null) return -order;
        if (typeof v1 === 'string' && typeof v2 === 'string') {
          return order * v1.localeCompare(v2, 'it');
        }
        const n1 = Number(v1), n2 = Number(v2);
        if (!isNaN(n1) && !isNaN(n2)) return order * (n1 - n2);
        return order * String(v1).localeCompare(String(v2), 'it');
      });
    };
  }

  override ngOnInit(): void {
    super.ngOnInit();
    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: (data: UtilityAggregator[]) => {
        this.utilityAggregatorMap = data.reduce((map, item) => {
          map[item.id] = item;
          return map;
        }, {} as { [key: number]: UtilityAggregator });
      },
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });
  }

  // CRITICO: AbstractDataTableComponent.ngAfterViewInit() (frontend/src/app/core/components/
  // abstract-data-table.component.ts, righe 62-65) collega sort e paginator al dataSource:
  //   ngAfterViewInit() {
  //     if (this.sort) this.dataSource.sort = this.sort;
  //     if (this.paginator) this.dataSource.paginator = this.paginator;
  //   }
  // Il vecchio componente PrimeNG sovrascriveva ngAfterViewInit() SENZA "override" e SENZA
  // chiamare super.ngAfterViewInit() (faceva solo this.screen.updateMinHeight()). Se questo
  // pattern venisse riprodotto tale e quale qui, il codice compilerebbe ma sort/paginator
  // resterebbero scollegati dal dataSource: click su un header colonna non ordinerebbe nulla,
  // il paginatore non cambierebbe pagina — nessun errore visibile, solo funzionalità silenziosamente
  // rotta. super.ngAfterViewInit() va chiamato per PRIMO.
  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
    this.screen.updateMinHeight();
  }

  getUtilizersNames(utility: Utility): string {
    return utility.asset?.utilizerGrants?.map(u => u.utilizer?.name).join(', ') ?? '';
  }

  private readonly expireStateLabels: Record<ExpireState, string> = {
    [ExpireState.ACTIVE]: 'Attiva',
    [ExpireState.EXPIRING30]: 'In scadenza (30gg)',
    [ExpireState.EXPIRING60]: 'In scadenza (60gg)',
    [ExpireState.EXPIRING90]: 'In scadenza (90gg)',
    [ExpireState.EXPIRED]: 'Scaduta',
  };

  // CORRETTO rispetto all'originale: il vecchio getLabel() mappava solo 3 chiavi
  // (ACTIVE/EXPIRING/EXPIRED), lasciando EXPIRING30/EXPIRING60/EXPIRING90 (3 dei 5 valori reali
  // dell'enum ExpireState) senza etichetta — stringa vuota in tabella e in export CSV. Ora tutti
  // e 5 i valori hanno una label.
  getLabel(status: ExpireState | null | undefined): string {
    if (!status) return '';
    return this.expireStateLabels[status] ?? '';
  }

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/building'], {queryParams: {selectedId: assetId}})
    );
    window.open(url, '_blank');
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
        return utility.security_deposit != null
          ? utility.security_deposit.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
          : '';
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

  override exportToCSV(): void {
    super.exportToCSV(this.allColumns, 'utenze');
  }

  override itemInstance(): Utility {
    return Utility.create();
  }

  override editDialogComponent(): Type<unknown> {
    return UtilityEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'Utenza';
  }

  override openDeleteDialog(entity: Utility): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Utenza',
        message: `Sei sicuro di voler eliminare l'Utenza ${entity.utility_id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Utility): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Utenza',
        message: `Riattiva Utenza ${entity.utility_id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
