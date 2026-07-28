import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {plainToInstance} from 'class-transformer';
import {IBudgetChapter} from './budget-chapter.interface';
import {SupplyType} from '../enum/supply-type.enum';

export class BudgetChapter extends AbstractEntity implements IBudgetChapter {

  chapter_code!: string;
  article?: '0' | '1';
  name?: string;
  code?: string;
  pdc?: string;
  supply_type!: SupplyType;
  description?: string;

  get label(): string {
    return `${this.chapter_code}/${this.article} - ${this.description ?? ''}`.trim().replace(/ - $/, '');
  }

  static create(data?: Partial<BudgetChapter>): BudgetChapter {
    return plainToInstance(BudgetChapter, {
      id: 0,
      chapter_code: null,
      article: null,
      description: '',
      pdc: '',
      supply_type: null,
      deleted: false,
      ...data
    });
  }
}
