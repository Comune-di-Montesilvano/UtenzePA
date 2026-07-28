import {IConsipAgreement} from './consip-agreement.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {Supplier} from '../../suppliers/entity/supplier.entity';

export class ConsipAgreement extends AbstractEntity implements IConsipAgreement {
  name!: string;
  description?: string;
  cig_master!: string;

  @Type(() => Date)
  @Transform(({value, type}) => {
    if (type === 0 && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, {toPlainOnly: true})
  expiration_date!: Date;

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  expiration_date_range?: String[];

  safeguard!: boolean;

  @Type(() => Number)
  supplier_id!: number;

  @Exclude({toPlainOnly: true})
  supplier?: Supplier;

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
