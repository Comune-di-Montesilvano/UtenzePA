import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IInvoice} from './invoice.interface';
import {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';
import {Contract} from '../../contracts/entity/contract.entity';

export class Invoice extends AbstractEntity implements IInvoice {
  invoice_id!: string;
  protocol_number!: string;

  @Type(() => Number)
  net_amount_excl_vat!: number;

  @Type(() => Number)
  last_invoice_arrears?: number;

  notes_on_invoices?: string;
  contratto_id_fk!: number;

  @Type(() => Date)
  invoice_date!: Date;

  @Exclude({toPlainOnly: true})
  @Type(() => Contract)
  contratto?: Contract;

  @Type(() => BudgetChapter)
  @Transform(({value}) => {
    if (!Array.isArray(value)) return value;
    return value.map((bc: BudgetChapter) => bc.id);
  }, {toPlainOnly: true})
  budget_chapters?: BudgetChapter[];

  @Exclude({toPlainOnly: true})
  is_paid?: boolean;

  static create(data?: Partial<Invoice>): Invoice {
    return plainToInstance(Invoice, {
      invoice_id: '',
      protocol_number: null,
      net_amount_excl_vat: 0,
      invoice_date: null,
      contratto_id_fk: null,
      deleted: false,
      ...data
    });
  }
}
