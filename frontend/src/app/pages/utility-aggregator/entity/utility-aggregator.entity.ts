import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {UtilityAggregator as IUtilityAggregator} from './utility-aggregator.interface';

export class UtilityAggregator extends AbstractEntity implements IUtilityAggregator {
  code!: string;
  description?: string;

  static create(data?: Partial<UtilityAggregator>): UtilityAggregator {
    return plainToInstance(UtilityAggregator, {
      code: null,
      description: null,
      ...data,
    });
  }
}

