import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IUtilizer} from './utilizer.interface';

export class Utilizer extends AbstractEntity implements IUtilizer {
  name!: string;
  description?: string;

  static create(data?: Partial<Utilizer>): Utilizer {
    return plainToInstance(Utilizer, {
      name: null,
      description: null,
      deleted: false,
      ...data,
    });
  }
}
