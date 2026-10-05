import {IConsipAgreement} from './consip-agreement.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {toIsoDate} from '../../utilities/consumptions/consumption.model';

export class ConsipAgreement extends AbstractEntity implements IConsipAgreement {
  name!: string;
  description?: string;
  cig_master!: string;

  // Giorno locale 'AAAA-MM-GG', non toISOString(): il backend tiene i primi 10
  // caratteri e una data del datepicker (mezzanotte locale) diventerebbe il giorno prima.
  @Type(() => Date)
  @Transform(({value, type}) => {
    if (type === 0 && value instanceof Date) {
      return toIsoDate(value);
    }
    return value;
  }, {toPlainOnly: true})
  expiration_date!: Date;

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? toIsoDate(date) : date));
    }
    return value;
  }, {toPlainOnly: true})
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
