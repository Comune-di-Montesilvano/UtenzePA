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
