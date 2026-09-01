import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IAsset} from './asset.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {Utility} from '../../utilities/entity/utility.entity';
import {UtilizerGrant} from '../../utilizer-grant/entity/utilizer-grant.entity';
import {AssetAggregator} from '../../asset-aggregator/entity/asset-aggregator.entity';
import {Utilizer} from '../../utilizer/entity/utilizer.entity';

export class Asset extends AbstractEntity implements IAsset {
  asset_name!: string;
  associated_building?: string;
  toponym?: string;
  address?: string;
  civic_number?: string;
  zip_code?: string;
  municipality?: string;
  ownership!: number;
  specific_details?: string;
  memo?: string;
  services_and_artifacts?: string;
  latitude?: string;
  longitude?: string;
  geocoded_latitude?: string;
  geocoded_longitude?: string;
  sheet?: string;
  parcel?: string;
  subordinate?: string;

  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  area_sqm?: number;

  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  cadastral_value?: number;
  category?: string;
  asset_type_id!: number;

  @Exclude({toPlainOnly: true})
  assetAggregator?: AssetAggregator | null;

  @Exclude({toPlainOnly: true})
  created_by?: { id: number; name: string } | null;

  @Exclude({toPlainOnly: true})
  @Type(() => Utility)
  utilities?: Utility[];

  @Exclude({toPlainOnly: true})
  @Type(() => Utilizer)
  utilizers?: Utilizer[];

  @Exclude({toPlainOnly: true})
  @Type(() => UtilizerGrant)
  utilizerGrants?: UtilizerGrant[];

  static create(data?: Partial<Asset>): Asset {
    return plainToInstance(Asset, {
      asset_id: 0,
      asset_name: '',
      asset_type_id: null,
      ownership: 0,
      area_sqm: 0,
      cadastral_value: 0,
      deleted: false,
      ...data
    });
  }
}


