import {ChangeDetectionStrategy, Component, inject, Type} from '@angular/core';
import {ACCOUNTING_SOURCE, AccountingStateService} from '../../core/services/accounting-state.service';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {formatEuro} from '../budget-chapters/spending/budget-chapter-spending.service';
import {Commitment, competenceLabel} from './commitment.model';
import {CommitmentSheetComponent} from './commitment-sheet.component';

@Component({
  selector: 'app-data-table-commitments',
  standalone: true,
  imports: [
    ListToolbarComponent, MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, HasRoleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-commitments.component.html',
})
export class DataTableCommitmentsComponent extends AbstractDataTableComponent<Commitment> {
  private static readonly STORAGE_KEY = 'columns:commitments';

  readonly allColumns: IColumnDef[] = [
    {field: 'label', header: 'Numero'},
    {field: 'chapter_label', header: 'Capitolo'},
    {field: 'fiscal_year', header: 'Competenza'},
    {field: 'supplier_name', header: 'Fornitore'},
    {field: 'contracts', header: 'Contratti'},
    {field: 'amount', header: 'Importo'},
    {field: 'spent', header: 'Speso'},
    {field: 'remaining', header: 'Rimanenza'},
    {field: 'notes', header: 'Note'},
  ];

  readonly eur = formatEuro;
  readonly competence = competenceLabel;
  readonly accountingSource = ACCOUNTING_SOURCE;
  // Import della contabilità acceso: niente impegni nuovi né cancellazioni di quelli importati.
  accountingActive = false;

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableCommitmentsComponent.STORAGE_KEY, this.allColumns,
    new Set(['label', 'chapter_label', 'fiscal_year', 'supplier_name', 'contracts', 'amount', 'spent', 'remaining']),
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  constructor(screen: ScreenSizeService) {
    super(screen);
    inject(AccountingStateService).active$.subscribe(active => this.accountingActive = active);
  }

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableCommitmentsComponent.STORAGE_KEY, this.selectedColumns);
  }

  override itemInstance(): Commitment {
    return Commitment.create();
  }

  protected override useSheet(): boolean {
    return true;
  }

  override editDialogComponent(): Type<unknown> {
    return CommitmentSheetComponent;
  }

  protected override entityLabel(): string {
    return 'impegno';
  }

  override openDeleteDialog(entity: Commitment): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina impegno',
        message: `Eliminare l'impegno ${entity.label} (competenza ${competenceLabel(entity)})? Le righe di fattura assegnate in automatico passano agli altri impegni.`,
        confirmLabel: 'Elimina',
        danger: true,
      },
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Commitment): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Ripristina impegno', message: `Riattiva l'impegno ${entity.label}?`, confirmLabel: 'Ripristina'},
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
