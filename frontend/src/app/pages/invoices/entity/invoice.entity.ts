import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IInvoice} from './invoice.interface';
import {Utility} from '../../utilities/entity/utility.entity';
import {Supplier} from '../../suppliers/entity/supplier.entity';
import {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';

export class Invoice extends AbstractEntity implements IInvoice {
  invoice_id!: string;
  protocol_number!: string;

  @Type(() => Number)
  @Transform(({value, type}) => {
    console.log(value);
    return value;
  }, {toPlainOnly: true})
  net_amount_excl_vat!: number;

  @Type(() => Number)
  @Transform(({value, type}) => {
    console.log(value);
    return value;
  }, {toPlainOnly: true})
  last_invoice_arrears?: number;

  notes_on_invoices?: string;
  utility_id_fk!: number;
  supplier_id_fk?: number;

  @Type(() => Date)
  @Transform(({value, type}) => {
    if (type === 0 && value instanceof Date) return value.toISOString();
    return value;
  }, {toPlainOnly: true})
  invoice_date!: Date;

  @Exclude({toPlainOnly: true})
  @Type(() => Utility)
  utility?: Utility;

  @Exclude({toPlainOnly: true})
  @Type(() => Supplier)
  supplier?: Supplier;

  @Type(() => BudgetChapter)
  @Transform(({value}) => {
    if (!Array.isArray(value)) return value;
    return value.map((p: BudgetChapter) => p.id);
  }, {toPlainOnly: true})
  budget_chapters?: BudgetChapter[];

  static create(data?: Partial<Invoice>): Invoice {
    return plainToInstance(Invoice, {
      invoice_id: '',
      protocol_number: null,
      net_amount_excl_vat: 0,
      invoice_date: null,
      utility_id_fk: null,
      supplier_id_fk: null,
      deleted: false,
      ...data
    });
  }
}

