import {IConsipAgreement} from './consip-agreement.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {DateOnly} from '../../../core/helpers/date.helper';

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
