import {Component} from '@angular/core';
import {DataTableBudgetChaptersComponent} from './data-table-budget-chapters.component';
import {SearchBudgetChapters} from './search-budget-chapters.component';
import {BudgetChaptersService} from './budget-chapters.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {BudgetChapter} from './entity/budget-chapter.entity';

@Component({
  selector: 'app-budget-chapters',
  standalone: true,
  imports: [
    DataTableBudgetChaptersComponent,
    SearchBudgetChapters
  ],
  templateUrl: './budget-chapters.component.html'
})
export class BudgetChaptersComponent extends AbstractComponent<BudgetChapter> {

  constructor(protected override service: BudgetChaptersService) {
    super();
  }

  protected override getEntityIdentifier(entity: BudgetChapter): string {
    return entity.chapter_code;
  }

  protected override entityToPayload(entity: BudgetChapter): Partial<BudgetChapter> {
    return {
      chapter_code: entity.chapter_code,
      article: entity.article,
      description: entity.description,
      pdc: entity.pdc,
      supply_type: entity.supply_type,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
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
