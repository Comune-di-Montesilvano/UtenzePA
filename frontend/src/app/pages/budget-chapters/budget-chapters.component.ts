import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {DataTableBudgetChaptersComponent} from './data-table-budget-chapters.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {BudgetChaptersService} from './budget-chapters.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {SearchBudgetChapters} from './search-budget-chapters.component';

@Component({
             selector: 'app-budget-chapters',
             standalone: true,
             providers: [MessageService],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               DataTableBudgetChaptersComponent,
               SearchBudgetChapters,
               ToastModule
             ],
             templateUrl: './budget-chapters.component.html'
           })
export class BudgetChaptersComponent extends AbstractComponent<BudgetChapter> {

  creationResult?: { success: boolean; message?: string };

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

  override onCreate(entity: BudgetChapter) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
                                             next: (item: BudgetChapter) => {
                                               this.list.push(item);
                                               this.messageService.add({
                                                                         severity: 'success',
                                                                         summary: 'Capitolo creato',
                                                                         detail: this.getEntityIdentifier(item),
                                                                         key: 'global'
                                                                       });
                                               this.creationResult = {
                                                 success: true,
                                                 message: 'Capitolo creato con successo'
                                               };
                                               this.loadAll();
                                             },
                                             error: (err: any) => {
                                               this.creationResult = {success: false};
                                               this.handleError(err, 'Errore generico nella creazione capitolo');
                                             }
                                           });
  }
}
