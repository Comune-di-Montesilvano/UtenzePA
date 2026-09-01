import {IUtilizerGrant} from '../../utilizer-grant/entity/utilizer-grant.interface';
import {IAssetAggregator} from '../../asset-aggregator/entity/asset-aggregator.interface';
import {IUtilizer} from '../../utilizer/entity/utilizer.interface';

export interface IAsset {
  id: number;
  asset_name: string;
  associated_building?: string | null;
  toponym?: string | null;
  address?: string | null;
  civic_number?: string | null;
  zip_code?: string | null;
  municipality?: string | null;
  ownership: number;
  specific_details?: string | null;
  memo?: string | null;
  services_and_artifacts?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  // Posizione stimata da geocodifica indirizzo (GeocodingModule, backend) —
  // sola lettura qui: mai inviata in un update, solo per pre-posizionare il
  // marker su LocationMapComponent quando manca una posizione GPS reale.
  geocoded_latitude?: string | null;
  geocoded_longitude?: string | null;
  sheet?: string | null;
  parcel?: string | null;
  subordinate?: string | null;
  area_sqm?: number | null;
  cadastral_value?: number | null;
  category?: string | null;
  asset_type_id: number;
  assetAggregator?: IAssetAggregator| null;
  created_by?: { id: number; name: string } | null;
  utilizers?: IUtilizer[] | null;

  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}
