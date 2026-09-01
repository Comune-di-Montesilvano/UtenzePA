import { HardType } from '../utility-types/enum/hard-type.enum';

export type MapPointType = 'asset' | 'utility';
export type MapPointSource = 'gps' | 'geocoded';
export type UngeolocatedReason = 'no_address' | 'geocode_failed';

export interface MapPoint {
  id: number;
  type: MapPointType;
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  source: MapPointSource;
  // Solo per type 'utility' — pilota l'icona per tipologia sulla mappa.
  hardType?: HardType;
  // Solo per type 'asset' — nome ligature Material Icons dell'aggregato
  // immobile collegato (null/assente = usa il fallback fisso).
  icon?: string | null;
  // Solo per type 'utility' — id dell'asset collegato, usato per il badge
  // "numero contatori" sul marker immobile.
  assetId?: number | null;
}

export interface UngeolocatedItem {
  id: number;
  type: MapPointType;
  name: string;
  reason: UngeolocatedReason;
}

export interface MapPointsResponse {
  points: MapPoint[];
  ungeolocated: UngeolocatedItem[];
}

export const UNGEOLOCATED_REASON_LABELS: Record<UngeolocatedReason, string> = {
  no_address: 'Nessun indirizzo inserito',
  geocode_failed: 'Indirizzo non geolocalizzabile',
};
