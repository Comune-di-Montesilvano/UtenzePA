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
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {BudgetChapterEditDialogComponent} from './budget-chapter-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-budget-chapters',
  standalone: true,
  imports: [
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

  displayedColumns = ['actions', 'id', 'chapter_code', 'article', 'pdc', 'description', 'supply_type'];
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
