import {Exclude, plainToInstance, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IInvoice} from './invoice.interface';
import {Utility} from '../../utilities/entity/utility.entity';
import {Supplier} from '../../suppliers/entity/supplier.entity';
import {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';

export class Invoice extends AbstractEntity implements IInvoice {
  invoice_id!: string;
  protocol_number!: string;

  @Type(() => Number)
  net_amount_excl_vat!: number;

  @Type(() => Number)
  last_invoice_arrears?: number;

  notes_on_invoices?: string;
  utility_id_fk!: number;
  supplier_id_fk?: number;

  @Type(() => Date)
  invoice_date!: Date;

  @Exclude({toPlainOnly: true})
  @Type(() => Utility)
  utility?: Utility;

  @Exclude({toPlainOnly: true})
  @Type(() => Supplier)
  supplier?: Supplier;

  @Type(() => BudgetChapter)
  budget_chapters?: BudgetChapter[];

  @Exclude({toPlainOnly: true})
  is_paid?: boolean;

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
