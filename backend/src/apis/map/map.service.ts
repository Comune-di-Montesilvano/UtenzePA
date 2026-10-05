import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { MapQueryDto } from './dto/map-query.dto';
import { Plant } from '@apis/plants/entity/plant.entity';
import { PlantStatus, PlantType, PositionQuality } from '@apis/plants/enum/plant.enum';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
import { firstLocatedAsset, resolvePlantPosition } from '@apis/plants/plant.calc';

export interface MapPoint {
  id: number;
  type: 'asset' | 'utility' | 'plant';
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  source: 'gps' | 'geocoded';
  // Immobile dismesso, utenza cessata, impianto dismesso: marker sbiadito.
  inactive?: boolean;
  // Solo per type 'utility' — pilota l'icona per tipologia (acqua/luce/gas/
  // internet) nella mappa frontend, vedi HardTypeIcon/HardTypeColor.
  hardType?: HardTypeEnum;
  // Solo per type 'asset' — nome ligature Material Icons della funzione
  // dell'immobile, null se assente (frontend applica un fallback).
  icon?: string | null;
  // Solo per type 'utility' — id dell'asset collegato, usato dal frontend per
  // contare le utenze per edificio e mostrare un badge sul marker immobile
  // (a zoom alto i marker utenza senza GPS proprio, sovrapposti esattamente
  // all'asset, coprono/nascondono a vicenda: il conteggio resta visibile
  // comunque).
  assetId?: number | null;
  // type 'utility': impianto da cui eredita la posizione, oppure (con GPS
  // proprio) il primo impianto collegato, per la linea verso l'impianto.
  // type 'plant': immobile dell'impianto (primo localizzabile), per
  // raggrupparlo sotto il marker immobile o tracciare la linea.
  plantId?: number | null;
  // Solo per type 'plant' — pilota l'icona per tipo impianto.
  plantType?: PlantType;
}

export interface UngeolocatedItem {
  id: number;
  type: 'asset' | 'utility' | 'plant';
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
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
  ) {}

  async getPoints(
    filters: MapQueryDto,
  ): Promise<{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }> {
    const showAssets = filters.showAssets !== false;
    const showUtilities = filters.showUtilities !== false;
    const showPlants = filters.showPlants !== false;

    const points: MapPoint[] = [];
    const ungeolocated: UngeolocatedItem[] = [];

    // Perimetro: tipologia e funzione dell'immobile delimitano immobili,
    // utenze e impianti collegati (es. Funzione=Scuole → scuole, loro contatori
    // e loro impianti). Lo stato filtra solo il livello immobili, altrimenti
    // "solo attivi" nasconderebbe utenze e impianti senza immobile collegato.
    // I filtri di utenze e impianti restringono solo il proprio livello.
    const perimeter = {
      ...(filters.natureIds?.length ? { nature_id: In(filters.natureIds) } : {}),
      ...(filters.functionIds?.length ? { function_id: In(filters.functionIds) } : {}),
    };
    const hasPerimeter = Object.keys(perimeter).length > 0;

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: {
          deleted: false,
          ...perimeter,
          ...(filters.statuses?.length ? { status: In(filters.statuses) } : {}),
        },
        relations: { assetFunction: true },
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
            icon: asset.assetFunction?.icon ?? null,
            ...(asset.status === AssetStatusEnum.DISMESSO ? { inactive: true } : {}),
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

    if (showPlants) {
      const plants = await this.plantRepo.find({
        where: {
          deleted: false,
          ...(filters.plantTypes?.length ? { type: In(filters.plantTypes) } : {}),
          ...(filters.plantStatuses?.length ? { status: In(filters.plantStatuses) } : {}),
          ...(hasPerimeter ? { assets: perimeter } : {}),
        },
        relations: { assets: true },
      });
      for (const plant of plants) {
        const asset = firstLocatedAsset(plant.assets);
        const position = resolvePlantPosition({ ...plant, asset });
        if (position) {
          points.push({
            id: plant.id,
            type: 'plant',
            name: plant.name,
            address: plant.address ?? asset?.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.quality === PositionQuality.PRECISE ? 'gps' : 'geocoded',
            plantType: plant.type,
            ...(asset?.id ? { assetId: asset.id } : {}),
            ...(plant.status === PlantStatus.DECOMMISSIONED ? { inactive: true } : {}),
          });
        } else {
          ungeolocated.push({
            id: plant.id,
            type: 'plant',
            name: plant.name,
            reason:
              isSet(plant.address) || (plant.assets ?? []).some((a) => isSet(a.address))
                ? 'geocode_failed'
                : 'no_address',
          });
        }
      }
    }

    if (showUtilities) {
      const utilityWhere = {
        deleted: false,
        ...(filters.utilityTypeIds?.length ? { utility_type_id_fk: In(filters.utilityTypeIds) } : {}),
        ...(filters.includeInactiveUtilities === false ? { supply_active: true } : {}),
      };
      // Nel perimetro: collegata a un immobile del perimetro o a un impianto di uno di questi.
      const utilities = await this.utilityRepo.find({
        where: hasPerimeter
          ? [{ ...utilityWhere, assets: perimeter }, { ...utilityWhere, plants: { assets: perimeter } }]
          : utilityWhere,
        relations: { assets: true, plants: { assets: true }, utilityType: true },
      });

      for (const utility of utilities) {
        const linked = utility.assets ?? [];
        const base = {
          id: utility.id,
          type: 'utility' as const,
          name: utility.utility_id,
          hardType: utility.utilityType?.hard_type,
          ...(utility.supply_active === false ? { inactive: true } : {}),
        };

        const firstPlant = (utility.plants ?? []).find((p) => !p.deleted);
        // Contatore con GPS proprio: è fisicamente in un punto solo.
        if (isSet(utility.latitude) && isSet(utility.longitude)) {
          points.push({
            ...base,
            address: linked[0]?.address ?? null,
            lat: utility.latitude,
            lng: utility.longitude,
            source: 'gps',
            assetId: linked[0]?.id ?? null,
            ...(firstPlant ? { plantId: firstPlant.id } : {}),
          });
          continue;
        }

        // Senza GPS proprio: un marker per ogni immobile collegato
        // localizzabile (stesso id utenza, assetId diverso), poi uno per ogni
        // impianto collegato in un punto non già occupato (un impianto dentro
        // lo stesso immobile non duplica il marker).
        let placed = 0;
        const usedPoints = new Set<string>();
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
          usedPoints.add(`${position.lat}|${position.lng}`);
          placed++;
        }
        const linkedPlants = (utility.plants ?? []).filter((p) => !p.deleted);
        for (const plant of linkedPlants) {
          const plantAsset = firstLocatedAsset(plant.assets);
          const position = resolvePlantPosition({ ...plant, asset: plantAsset });
          if (!position || usedPoints.has(`${position.lat}|${position.lng}`)) continue;
          points.push({
            ...base,
            address: plant.address ?? plantAsset?.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.quality === PositionQuality.PRECISE ? 'gps' : 'geocoded',
            assetId: null,
            plantId: plant.id,
          });
          usedPoints.add(`${position.lat}|${position.lng}`);
          placed++;
        }

        if (placed === 0) {
          ungeolocated.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            reason:
              linked.some((a) => isSet(a.address)) || linkedPlants.some((p) => isSet(p.address))
                ? 'geocode_failed'
                : 'no_address',
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
