import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IAssetAggregator} from './asset-aggregator.interface';
import {plainToInstance} from 'class-transformer';

export class AssetAggregator extends AbstractEntity implements IAssetAggregator {
  description?: string;
  code?: string;
  icon?: string;

  static create(data?: Partial<AssetAggregator>): AssetAggregator {
    return plainToInstance(AssetAggregator, {id: 0, description: '', code: '', icon: '', ...data});
  }
}
