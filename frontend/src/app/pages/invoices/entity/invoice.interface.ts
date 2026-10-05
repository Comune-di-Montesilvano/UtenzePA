import type {InvoiceLine} from './invoice-line.model';
import {IContract} from '../../contracts/entity/contract.interface';

export interface IInvoice {
  id: number;
  invoice_id: string;
  invoice_date: Date | null;
  protocol_number: string | null;
  net_amount_excl_vat: number | null;
  total_amount?: number | null;
  supplier_id_fk?: number | null;
  last_invoice_arrears?: number | null;
  notes_on_invoices?: string | null;
  contratto_id_fk: number | null;
  create_date: Date | null;
  update_date: Date | null;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  contratto?: IContract | null;
  lines?: InvoiceLine[];
  is_paid?: boolean;
}
