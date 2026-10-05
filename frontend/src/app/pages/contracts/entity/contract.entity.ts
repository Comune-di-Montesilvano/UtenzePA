import { AbstractEntity } from '../../../core/entities/abstract.entity';
import { IContract } from './contract.interface';
import { plainToInstance, Exclude } from 'class-transformer';
import { ThirdParty } from '../../third-parties/entity/third-party.entity';
import { ConsipAgreement } from '../../consip-agreement/entity/consip-agreement.entity';
import { Utility } from '../../utilities/entity/utility.entity';
import { SystemUser } from '../../system-users/entity/system-user.entity';
import { DateOnly } from '../../../core/helpers/date.helper';

export class Contract extends AbstractEntity implements IContract {
  supplier_id_fk?: number | null;
  cig_contract?: string;
  cig_exempt?: boolean;
  // Manutenzione compresa nel contratto (es. convenzione Consip Luce).
  maintenance_included?: boolean;
  // Chiuso/scaduto esplicito: mai corrente, anche senza date.
  closed?: boolean;
  consip_order?: string;
  consip_agreement_id?: number | null;
  @DateOnly()
  supply_start_date?: Date | null;
  @DateOnly()
  supply_expiry_date?: Date | null;
  @DateOnly()
  management_expiry_date?: Date | null;
  @DateOnly()
  takeover_termination_date?: Date | null;
  utility_ids?: number[];

  @Exclude({ toPlainOnly: true })
  supplier?: ThirdParty;

  @Exclude({ toPlainOnly: true })
  consipAgreement?: ConsipAgreement;

  @Exclude({ toPlainOnly: true })
  utilities?: Utility[];

  // Popolato dal GET (relations del service backend), mai inviato.
  @Exclude({ toPlainOnly: true })
  updated_by?: SystemUser | null;

  get isCurrent(): boolean {
    if (this.closed) return false;
    if (!this.supply_expiry_date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.supply_expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  }

  static create(data?: Partial<Contract>): Contract {
    return plainToInstance(Contract, { id: 0, deleted: false, ...data });
  }
}
