import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';

export class AssetFunction extends AbstractEntity {
  name!: string;
  icon?: string | null;

  static create(data?: Partial<AssetFunction>): AssetFunction {
    return plainToInstance(AssetFunction, {id: 0, name: '', icon: null, ...data});
  }
}
