import {Component, ChangeDetectionStrategy} from '@angular/core';
import {DataTableBudgetChaptersComponent} from './data-table-budget-chapters.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {budgetChapterFilters} from './budget-chapters-filters';
import {BudgetChaptersService} from './budget-chapters.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {BudgetChapter} from './entity/budget-chapter.entity';

@Component({
  selector: 'app-budget-chapters',
  standalone: true,
  imports: [
    DataTableBudgetChaptersComponent,
    ListFiltersComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './budget-chapters.component.html'
})
export class BudgetChaptersComponent extends AbstractComponent<BudgetChapter> {

  override filterDefs = budgetChapterFilters();

  constructor(protected override service: BudgetChaptersService) {
    super();
  }

  protected override getEntityIdentifier(entity: BudgetChapter): string {
    return entity.chapter_code;
  }

  protected override entityToPayload(entity: BudgetChapter): Partial<BudgetChapter> {
    return {...BudgetChapter.toPayload(entity), created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }

  protected override entityLabel(): string {
    return 'Capitolo';
  }

  override onCreate(entity: BudgetChapter) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
      next: (item: BudgetChapter) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: `${this.entityLabel()} creato`,
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione capitolo');
      }
    });
  }
}
