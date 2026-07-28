import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IUtilizerGrant} from './utilizer-grant.interface';
import {Asset} from '../../assets/entity/asset.entity';
import {Utilizer} from '../../utilizer/entity/utilizer.entity';

export class UtilizerGrant extends AbstractEntity implements IUtilizerGrant {

  concession_act?: string;
  utilities_to_be_taken_over?: boolean;
  usage_type?: string;

  @Type(() => Date)
  @Transform(({value, type}) => {
    if (type === 0 && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, {toPlainOnly: true})
  grant_date?: Date;

  @Type(() => Date)
  @Transform(({value, type}) => {
    if (type === 0 && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, {toPlainOnly: true})
  expire_date?: Date;

  asset_id_fk!: number;

  utilizer_id_fk!: number;

  @Exclude({toPlainOnly: true})
  @Type(() => Asset)
  asset?: Asset;

  @Exclude({toPlainOnly: true})
  @Type(() => Utilizer)
  utilizer?: Utilizer;

  static create(data?: Partial<UtilizerGrant>): UtilizerGrant {
    return plainToInstance(UtilizerGrant, {
      user_name: null,
      asset_id_fk: null,
      utilizer_id_fk: null,
      utilities_to_be_taken_over: null,
      deleted: false,
      ...data,
    });
  }
}
