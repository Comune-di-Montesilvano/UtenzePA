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
  // Solo per type 'asset' — nome ligature Material Icons dell'aggregato
  // immobile collegato (AssetAggregator.icon), null se l'aggregato non ne ha
  // una custom (frontend applica un fallback).
  icon?: string | null;
  // Solo per type 'utility' — id dell'asset collegato, usato dal frontend per
  // contare le utenze per edificio e mostrare un badge sul marker immobile
  // (a zoom alto i marker utenza senza GPS proprio, sovrapposti esattamente
  // all'asset, coprono/nascondono a vicenda: il conteggio resta visibile
  // comunque).
  assetId?: number | null;
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

  async getPoints(
    filters: MapQueryDto,
  ): Promise<{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }> {
    const showAssets = filters.showAssets !== false;
    const showUtilities = filters.showUtilities !== false;

    const points: MapPoint[] = [];
    const ungeolocated: UngeolocatedItem[] = [];

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: {
          deleted: false,
          ...(filters.assetAggregatorId ? { asset_type_id: filters.assetAggregatorId } : {}),
        },
        relations: { assetAggregator: true },
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
            icon: asset.assetAggregator?.icon ?? null,
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
          // Il filtro aggregato immobile va applicato anche alle utenze (tramite
          // l'asset collegato) — altrimenti col checkbox "Contatori" attivo i
          // contatori restano sempre tutti visibili, filtro senza effetto visibile.
          ...(filters.assetAggregatorId
            ? { asset: { asset_type_id: filters.assetAggregatorId } }
            : {}),
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
            assetId: utility.asset?.id ?? null,
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
