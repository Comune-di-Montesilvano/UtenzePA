import { HardType } from '../utility-types/enum/hard-type.enum';
import type { PlantType } from '../plants/plant.model';

export type MapPointType = 'asset' | 'utility' | 'plant';
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
  // Solo per type 'asset' — nome ligature Material Icons della funzione
  // dell'immobile (null/assente = usa il fallback fisso).
  icon?: string | null;
  // type 'utility': immobile collegato; type 'plant': immobile dell'impianto.
  // Raggruppano i punti sotto il marker immobile (badge) e tracciano la linea
  // quando stanno in un punto diverso.
  assetId?: number | null;
  // type 'utility': impianto da cui eredita la posizione o, con GPS proprio,
  // il primo impianto collegato (linea verso l'impianto).
  plantId?: number | null;
  // Solo per type 'plant' — pilota l'icona per tipo impianto.
  plantType?: PlantType;
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
