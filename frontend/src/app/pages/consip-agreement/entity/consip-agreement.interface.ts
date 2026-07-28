import {ISupplier} from '../../suppliers/entity/supplier.interface';

export interface IConsipAgreement {
  id: number;
  name: string;
  description?: string;
  cig_master: string;
  expiration_date: Date;
  safeguard: boolean;
  supplier_id: number;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  supplier?: ISupplier;
}
