import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IInvoice} from './invoice.interface';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {InvoiceLine, toLinePayload} from './invoice-line.model';
import {Contract} from '../../contracts/entity/contract.entity';
import {DateOnly} from '../../../core/helpers/date.helper';
import {SystemUser} from '../../system-users/entity/system-user.entity';

export class Invoice extends AbstractEntity implements IInvoice {
  invoice_id!: string;
  protocol_number!: string;

  @Type(() => Number)
  net_amount_excl_vat!: number | null;

  // Totale documento IVA inclusa.
  @Type(() => Number)
  total_amount?: number | null;

  supplier_id_fk?: number | null;

  @Type(() => Number)
  last_invoice_arrears?: number;

  notes_on_invoices?: string;
  contratto_id_fk!: number | null;

  @Type(() => Date)
  @DateOnly()
  invoice_date!: Date;

  @Exclude({toPlainOnly: true})
  @Type(() => Contract)
  contratto?: Contract;

  @Exclude({toPlainOnly: true})
  @Type(() => ThirdParty)
  supplier?: ThirdParty | null;

  // Popolato dal GET (relations del service backend), mai inviato.
  @Exclude({toPlainOnly: true})
  updated_by?: SystemUser | null;

  // In invio solo i campi della riga (toLinePayload), mai le relazioni.
  @Transform(({value}) => (Array.isArray(value) ? value.map(toLinePayload) : value), {toPlainOnly: true})
  lines?: InvoiceLine[];

  @Exclude({toPlainOnly: true})
  is_paid?: boolean;

  static create(data?: Partial<Invoice>): Invoice {
    return plainToInstance(Invoice, {
      invoice_id: '',
      protocol_number: null,
      net_amount_excl_vat: null,
      total_amount: null,
      invoice_date: null,
      contratto_id_fk: null,
      supplier_id_fk: null,
      lines: [],
      deleted: false,
      ...data
    });
  }
}
