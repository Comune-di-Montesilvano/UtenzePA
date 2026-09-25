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
    // omettere per errore il filtro (un id immobile non è mai negativo).
    let qualifyingAssetIds: number[] | null = null;
    if (filters.utilityTypeIds?.length) {
      const rows = await this.utilityRepo.find({
        where: { deleted: false, utility_type_id_fk: In(filters.utilityTypeIds) },
        relations: { assets: true },
      });
      qualifyingAssetIds = [...new Set(rows.flatMap((r) => (r.assets ?? []).map((a) => a.id)))];
    }

    // Filtri classificazione immobile — stessi criteri sugli immobili e sulle
    // utenze (tramite gli immobili collegati). Con where su una relazione
    // ManyToMany TypeORM idrata solo gli immobili che matchano: un'utenza
    // collegata a un immobile filtrato e a uno no compare solo sul primo.
    const assetClassWhere = {
      ...(filters.assetAggregatorIds?.length ? { asset_type_id: In(filters.assetAggregatorIds) } : {}),
      ...(filters.natureIds?.length ? { nature_id: In(filters.natureIds) } : {}),
      ...(filters.functionIds?.length ? { function_id: In(filters.functionIds) } : {}),
      ...(filters.statuses?.length ? { status: In(filters.statuses) } : {}),
    };
    const hasAssetClassFilter = Object.keys(assetClassWhere).length > 0;

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: {
          deleted: false,
          ...assetClassWhere,
          ...(qualifyingAssetIds !== null ? { id: In(qualifyingAssetIds.length ? qualifyingAssetIds : [-1]) } : {}),
        },
        relations: { assetAggregator: true, assetFunction: true },
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
            icon: asset.assetFunction?.icon ?? asset.assetAggregator?.icon ?? null,
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
          // I filtri immobile vanno applicati anche alle utenze (tramite gli
          // immobili collegati) — altrimenti col checkbox "Contatori" attivo i
          // contatori restano sempre tutti visibili, filtro senza effetto visibile.
          ...(hasAssetClassFilter ? { assets: assetClassWhere } : {}),
        },
        relations: { assets: true, utilityType: true },
      });

      for (const utility of utilities) {
        const linked = utility.assets ?? [];
        const base = {
          id: utility.id,
          type: 'utility' as const,
          name: utility.utility_id,
          hardType: utility.utilityType?.hard_type,
        };

        // Contatore con GPS proprio: è fisicamente in un punto solo.
        if (isSet(utility.latitude) && isSet(utility.longitude)) {
          points.push({
            ...base,
            address: linked[0]?.address ?? null,
            lat: utility.latitude,
            lng: utility.longitude,
            source: 'gps',
            assetId: linked[0]?.id ?? null,
          });
          continue;
        }

        // Senza GPS proprio: un marker per ogni immobile collegato
        // localizzabile (stesso id utenza, assetId diverso).
        let placed = 0;
        for (const asset of linked) {
          const position = this.resolveAssetPosition(asset);
          if (!position) continue;
          points.push({
            ...base,
            address: asset.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
            assetId: asset.id,
          });
          placed++;
        }

        if (placed === 0) {
          ungeolocated.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            reason: linked.some((a) => isSet(a.address)) ? 'geocode_failed' : 'no_address',
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
}
