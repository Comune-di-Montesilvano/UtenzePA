import {Component, Type, ChangeDetectionStrategy, inject, OnChanges} from '@angular/core';
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
import {ListToolbarComponent} from '../../core/components/list/list-toolbar.component';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {BudgetChapterEditDialogComponent} from './budget-chapter-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {ChapterBudgetService} from './chapter-budget.service';
import {ChapterYearSummary} from './chapter-budget.model';
import {formatEuro} from './spending/budget-chapter-spending.service';

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
export class DataTableBudgetChaptersComponent extends AbstractDataTableComponent<BudgetChapter> implements OnChanges {

  private static readonly STORAGE_KEY = 'columns:budget-chapters';

  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID'},
    {field: 'chapter_code', header: 'Cod. Capitolo'},
    {field: 'article', header: 'Articolo'},
    {field: 'pdc', header: 'PDC'},
    {field: 'description', header: 'Descrizione'},
    {field: 'utility_types', header: 'Tipi utenza'},
    {field: 'adjusted_budget', header: `Assestato ${new Date().getFullYear()}`},
    {field: 'available', header: `Disponibile ${new Date().getFullYear()}`},
  ];

  private budget = inject(ChapterBudgetService);
  readonly eur = formatEuro;
  readonly year = new Date().getFullYear();
  // Esercizio in corso per capitolo: una chiamata per l'elenco, ricaricata
  // quando l'elenco cambia (es. dopo il Salva di una scheda).
  yearByChapter = new Map<number, ChapterYearSummary>();

  selectedColumns: IColumnDef[] = this.loadColumnSelection(
    DataTableBudgetChaptersComponent.STORAGE_KEY, this.allColumns, new Set(['id', 'chapter_code', 'article', 'pdc', 'description', 'utility_types'])
  );

  get displayedColumns(): string[] {
    return ['actions', ...this.selectedColumns.map(c => c.field)];
  }

  compareColumns = (a: IColumnDef, b: IColumnDef): boolean => a?.field === b?.field;

  onColumnsChange(): void {
    this.saveColumnSelection(DataTableBudgetChaptersComponent.STORAGE_KEY, this.selectedColumns);
  }

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override ngOnChanges(): void {
    super.ngOnChanges();
    this.budget.yearSummary(new Date().getFullYear()).subscribe({
      next: rows => this.yearByChapter = new Map(rows.map(r => [r.budget_chapter_id, r])),
      error: err => console.error('Errore caricamento riepilogo esercizio:', err),
    });
  }

  override itemInstance(): BudgetChapter {
    return BudgetChapter.create();
  }

  // Scheda capitolo (entity-sheet): dialog ad altezza fissa.
  protected override useSheet(): boolean {
    return true;
  }

  override editDialogComponent(): Type<unknown> {
    return BudgetChapterEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'capitolo';
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
