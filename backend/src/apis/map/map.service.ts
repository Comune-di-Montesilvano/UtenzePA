import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

    // Id degli immobili con almeno un'utenza del/i tipo/i selezionato/i — il
    // filtro "Tipo utenza" deve restringere anche gli IMMOBILI (non solo i
    // contatori sparsi), indipendentemente dal checkbox "Utenze": un immobile
    // senza nessuna utenza di quel tipo non deve comparire. Query dedicata
    // (non riusa quella sotto per i punti-utenza, che applica anche il
    // filtro aggregato — qui serve il solo filtro tipo, sull'intero parco).
    // In([]) su MySQL/TypeORM genera "IN ()" non valido — [-1] sentinella
    // forza zero risultati quando nessuna utenza corrisponde, invece di
    // omettere per errore il filtro (asset_id_fk non è mai negativo).
    let qualifyingAssetIds: number[] | null = null;
    if (filters.utilityTypeIds?.length) {
      const rows = await this.utilityRepo.find({
        where: { deleted: false, utility_type_id_fk: In(filters.utilityTypeIds) },
        select: { asset_id_fk: true },
      });
      qualifyingAssetIds = [...new Set(rows.map((r) => r.asset_id_fk))];
    }

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: {
          deleted: false,
          ...(filters.assetAggregatorIds?.length ? { asset_type_id: In(filters.assetAggregatorIds) } : {}),
          ...(qualifyingAssetIds !== null ? { id: In(qualifyingAssetIds.length ? qualifyingAssetIds : [-1]) } : {}),
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
          ...(filters.utilityTypeIds?.length ? { utility_type_id_fk: In(filters.utilityTypeIds) } : {}),
          // Il filtro aggregato immobile va applicato anche alle utenze (tramite
          // l'asset collegato) — altrimenti col checkbox "Contatori" attivo i
          // contatori restano sempre tutti visibili, filtro senza effetto visibile.
          ...(filters.assetAggregatorIds?.length
            ? { asset: { asset_type_id: In(filters.assetAggregatorIds) } }
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
