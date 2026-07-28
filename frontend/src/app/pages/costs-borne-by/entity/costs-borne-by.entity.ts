import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ICostsBorneBy} from './costs-borne-by.interface';
import {plainToInstance} from 'class-transformer';

export class CostsBorneBy extends AbstractEntity implements ICostsBorneBy {
  name!: string;

  static create(data?: Partial<CostsBorneBy>): CostsBorneBy {
    return plainToInstance(CostsBorneBy, {id: 0, name: '', ...data});
  }
}

