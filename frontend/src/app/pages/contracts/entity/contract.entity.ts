import { AbstractEntity } from '../../../core/entities/abstract.entity';
import { IContract } from './contract.interface';
import { plainToInstance, Exclude } from 'class-transformer';
import { Supplier } from '../../suppliers/entity/supplier.entity';
import { ConsipAgreement } from '../../consip-agreement/entity/consip-agreement.entity';
import { Utility } from '../../utilities/entity/utility.entity';

export class Contract extends AbstractEntity implements IContract {
  supplier_id_fk?: number | null;
  cig_contract?: string;
  order_number?: string;
  consip_order?: string;
  consip_agreement_id?: number | null;
  supply_start_date?: Date | null;
  supply_expiry_date?: Date | null;
  management_expiry_date?: Date | null;
  takeover_termination_date?: Date | null;
  security_deposit?: number;
  utility_ids?: number[];

  @Exclude({ toPlainOnly: true })
  supplier?: Supplier;

  @Exclude({ toPlainOnly: true })
  consipAgreement?: ConsipAgreement;

  @Exclude({ toPlainOnly: true })
  utilities?: Utility[];

  get isCurrent(): boolean {
    if (!this.supply_expiry_date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.supply_expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  }

  static create(data?: Partial<Contract>): Contract {
    return plainToInstance(Contract, { id: 0, security_deposit: 0, deleted: false, ...data });
  }
}
