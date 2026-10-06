import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {plainToInstance, Type} from 'class-transformer';
import {IBudgetChapter} from './budget-chapter.interface';
import {UtilityType} from '../../utility-types/entity/utility-type.entity';

export class BudgetChapter extends AbstractEntity implements IBudgetChapter {

  chapter_code!: string;
  article?: '0' | '1';
  name?: string;
  code?: string;
  pdc?: string;
  description?: string;
  // Tipi utenza del capitolo; nessuno = tutti (es. SPRAR).
  @Type(() => UtilityType)
  utilityTypes?: UtilityType[];
  // Solo in invio: sostituisce i tipi del capitolo.
  utility_type_ids?: number[];

  get utilityTypesLabel(): string {
    const names = (this.utilityTypes ?? []).map(t => t.name).sort((a, b) => a.localeCompare(b, 'it'));
    return names.length ? names.join(', ') : 'Tutti i tipi';
  }

  get label(): string {
    return `${this.chapter_code}/${this.article} - ${this.description ?? ''}`.trim().replace(/ - $/, '');
  }

  // Campi inviati in creazione/modifica (senza autore): elenco e navigatore.
  static toPayload(e: BudgetChapter): Partial<BudgetChapter> {
    return {
      chapter_code: e.chapter_code, article: e.article, description: e.description, pdc: e.pdc,
      utility_type_ids: e.utility_type_ids ?? (e.utilityTypes ?? []).map(t => t.id),
    };
  }

  static create(data?: Partial<BudgetChapter>): BudgetChapter {
    return plainToInstance(BudgetChapter, {
      id: 0,
      chapter_code: null,
      article: null,
      description: '',
      pdc: '',
      utilityTypes: [],
      deleted: false,
      ...data
    });
  }
}
