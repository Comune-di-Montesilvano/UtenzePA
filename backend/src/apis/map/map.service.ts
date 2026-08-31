import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { MapQueryDto } from './dto/map-query.dto';

export interface MapPoint {
  id: number;
  type: 'asset' | 'utility';
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  source: 'gps' | 'geocoded';
  // Solo per type 'utility' — pilota l'icona per tipologia (acqua/luce/gas/
  // internet) nella mappa frontend, vedi HardTypeIcon/HardTypeColor.
  hardType?: HardTypeEnum;
}

export interface UngeolocatedItem {
  id: number;
  type: 'asset' | 'utility';
  name: string;
  reason: 'no_address' | 'geocode_failed';
}

interface Position {
  lat: string;
  lng: string;
  source: 'gps' | 'geocoded';
}

const isSet = (v: string | null | undefined): v is string => v != null && v.trim() !== '';

@Injectable()
export class MapService {
  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility) private readonly utilityRepo: Repository<Utility>,
  ) {}

  async getPoints(filters: MapQueryDto): Promise<{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }> {
    const showAssets = filters.showAssets !== false;
    const showUtilities = filters.showUtilities !== false;

    const points: MapPoint[] = [];
    const ungeolocated: UngeolocatedItem[] = [];

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: { deleted: false, ...(filters.assetAggregatorId ? { asset_type_id: filters.assetAggregatorId } : {}) },
      });

      for (const asset of assets) {
        const position = this.resolveAssetPosition(asset);
        if (position) {
          points.push({
            id: asset.id,
            type: 'asset',
            name: asset.asset_name,
            address: asset.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
          });
        } else {
          ungeolocated.push({
            id: asset.id,
            type: 'asset',
            name: asset.asset_name,
            reason: isSet(asset.address) ? 'geocode_failed' : 'no_address',
          });
        }
      }
    }

    if (showUtilities) {
      const utilities = await this.utilityRepo.find({
        where: {
          deleted: false,
          ...(filters.utilityTypeId ? { utility_type_id_fk: filters.utilityTypeId } : {}),
        },
        relations: { asset: true, utilityType: true },
      });

      for (const utility of utilities) {
        const position = this.resolveUtilityPosition(utility);
        if (position) {
          points.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            address: utility.asset?.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
            hardType: utility.utilityType?.hard_type,
          });
        } else {
          ungeolocated.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            reason: isSet(utility.asset?.address) ? 'geocode_failed' : 'no_address',
          });
        }
      }
    }

    return { points, ungeolocated };
  }

  private resolveAssetPosition(asset: Asset): Position | null {
    if (isSet(asset.latitude) && isSet(asset.longitude)) {
      return { lat: asset.latitude, lng: asset.longitude, source: 'gps' };
    }
    if (isSet(asset.geocoded_latitude) && isSet(asset.geocoded_longitude)) {
      return { lat: asset.geocoded_latitude, lng: asset.geocoded_longitude, source: 'geocoded' };
    }
    return null;
  }

  private resolveUtilityPosition(utility: Utility): Position | null {
    if (isSet(utility.latitude) && isSet(utility.longitude)) {
      return { lat: utility.latitude, lng: utility.longitude, source: 'gps' };
    }
    return utility.asset ? this.resolveAssetPosition(utility.asset) : null;
  }
}
