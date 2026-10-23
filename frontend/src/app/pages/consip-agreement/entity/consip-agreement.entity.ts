import {IConsipAgreement} from './consip-agreement.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {DateOnly} from '../../../core/helpers/date.helper';

export interface AgreementContract {
  id: number;
  cig_contract: string | null;
  consip_order: string | null;
  supply_start_date: string | null;
  supply_expiry_date: string | null;
  closed: boolean;
}

export class ConsipAgreement extends AbstractEntity implements IConsipAgreement {
  name!: string;
  description?: string;
  cig_master!: string;

  @Type(() => Date)
  @DateOnly()
  expiration_date!: Date;

  @DateOnly()
  expiration_date_range?: String[];

  safeguard!: boolean;

  @Type(() => Number)
  supplier_id!: number;

  @Exclude({toPlainOnly: true})
  supplier?: ThirdParty;

  // Solo da GET /consip-agreement/:id: contratti di fornitura della convenzione.
  @Exclude({toPlainOnly: true})
  contracts?: AgreementContract[];

  // Campi inviati in creazione/modifica (senza autore): elenco e navigatore.
  static toPayload(e: ConsipAgreement): Partial<ConsipAgreement> {
    return {
      supplier_id: e.supplier_id,
      name: e.name,
      description: e.description,
      cig_master: e.cig_master,
      safeguard: e.safeguard,
      expiration_date: e.expiration_date,
    };
  }

  static create(data?: Partial<ConsipAgreement>): ConsipAgreement {
    return plainToInstance(ConsipAgreement, {
      id: 0,
      name: '',
      description: '',
      safeguard: 0,
      create_date: new Date(),
      update_date: new Date(),
      ...data
    });
  }
}
