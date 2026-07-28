import {IUtilityType} from './utility-type.interface';
import {plainToInstance, Transform} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {HardType} from '../enum/hard-type.enum';
import {Purpose} from '../../purpose/entity/purpose.entity';
import {Type} from 'class-transformer';

export class UtilityType extends AbstractEntity implements IUtilityType {
  name!: string;
  description?: string;
  hard_type!: HardType;

  @Type(() => Purpose)
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((p: Purpose) => p.id);
  }, { toPlainOnly: true })
  purposes?: Purpose[];

  static create(data?: Partial<UtilityType>): UtilityType {
    return plainToInstance(UtilityType, {
      id:0,
      purposes: [],
      ...data
    });
  }
}
