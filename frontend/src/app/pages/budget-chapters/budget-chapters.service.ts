import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AbstractService } from '../../core/services/abstract.service';
import { BudgetChapter } from './entity/budget-chapter.entity';

@Injectable({
  providedIn: 'root'
})
export class BudgetChaptersService extends AbstractService<BudgetChapter> {
  protected override readonly BASE_URL = environment.apiUrl + '/budget-chapters';
  protected override readonly entityClass = BudgetChapter;
}
