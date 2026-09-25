import {Exclude, plainToInstance, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {AssetFunction} from '../../asset-function/entity/asset-function.entity';

export class AssetNature extends AbstractEntity {
  name!: string;
  icon?: string | null;
  // Inviato al backend (sostituisce le coppie ammesse); in lettura si
  // ricava da `functions`.
  function_ids?: number[];

  @Exclude({toPlainOnly: true})
  @Type(() => AssetFunction)
  functions?: AssetFunction[];

  static create(data?: Partial<AssetNature>): AssetNature {
    return plainToInstance(AssetNature, {id: 0, name: '', icon: null, functions: [], ...data});
  }
}
