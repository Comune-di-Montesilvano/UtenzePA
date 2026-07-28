import {IPurpose} from './purpose.interface';
import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {UseType} from '../enum/use-type.enum';

export class Purpose extends AbstractEntity implements IPurpose {

  name!: string;

  use_type!: UseType;

  static create(data?: Partial<Purpose>): Purpose {
    return plainToInstance(Purpose, {id: 0, name: '', use_type: UseType.GENERIC, ...data});
  }
}
