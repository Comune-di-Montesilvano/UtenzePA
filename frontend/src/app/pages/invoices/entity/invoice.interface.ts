import {IUtility} from '../../utilities/entity/utility.interface';
import {IBudgetChapter} from '../../budget-chapters/entity/budget-chapter.interface';
import {ISupplier} from '../../suppliers/entity/supplier.interface';

export interface IInvoice {
  id: number;
  invoice_id: string;
  invoice_date: Date | null;
  protocol_number: string | null;
  net_amount_excl_vat: number;
  last_invoice_arrears?: number | null;
  notes_on_invoices?: string | null;
  utility_id_fk: number;
  supplier_id_fk?: number | null;
  create_date: Date | null;
  update_date: Date | null;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  utility?: IUtility | null;
  supplier?: ISupplier | null;
  budget_chapters?: IBudgetChapter[];
  is_paid?: boolean;
}
