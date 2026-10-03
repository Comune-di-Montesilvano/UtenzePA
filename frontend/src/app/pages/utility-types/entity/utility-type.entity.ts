import {IUtilityType} from './utility-type.interface';
import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {HardType} from '../enum/hard-type.enum';

export class UtilityType extends AbstractEntity implements IUtilityType {
  name!: string;
  description?: string;
  hard_type!: HardType;

  static create(data?: Partial<UtilityType>): UtilityType {
    return plainToInstance(UtilityType, {
      id:0,
      ...data
    });
  }
}
