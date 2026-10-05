import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {SupplyType, SupplyTypeDescription} from './enum/supply-type.enum';
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {BudgetChapterEditDialogComponent} from './budget-chapter-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-budget-chapters',
  standalone: true,
  imports: [ListToolbarComponent, 
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressBarModule,
    HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-budget-chapters.component.html'
})
export class DataTableBudgetChaptersComponent extends AbstractDataTableComponent<BudgetChapter> {

  private static readonly STORAGE_KEY = 'columns:budget-chapters';

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID'},
    {field: 'chapter_code', header: 'Cod. Capitolo'},
    {field: 'article', header: 'Articolo'},
    {field: 'pdc', header: 'PDC'},
    {field: 'description', header: 'Descrizione'},
    {field: 'supply_type', header: 'Tipo Fornitura'},
  ];

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableBudgetChaptersComponent.STORAGE_KEY, this.allColumns, new Set(['id', 'chapter_code', 'article', 'pdc', 'description', 'supply_type'])
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableBudgetChaptersComponent.STORAGE_KEY, this.selectedColumns);
  }
  supplyTypeDescription = SupplyTypeDescription;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): BudgetChapter {
    return BudgetChapter.create();
  }

  override editDialogComponent(): Type<unknown> {
    return BudgetChapterEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'capitolo';
  }

  getSupplyTypeDescription(value: any): string {
    return this.supplyTypeDescription[value as SupplyType] || value;
  }

  override openDeleteDialog(entity: BudgetChapter): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina Capitolo',
        message: `Sei sicuro di voler eliminare l'anagrafica ${entity.chapter_code}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: BudgetChapter): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina Capitolo',
        message: `Riattiva Capitolo ${entity.chapter_code}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
