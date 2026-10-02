import { InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';
import { addDays, addMonths } from '@apis/utilizer-grant/real-estate-contract.calc';

export const INSPECTION_DUE_DAYS = 60;

// Tipi che stanno sempre dentro un edificio: senza immobile collegato sono un'anomalia.
export const ASSET_REQUIRED_TYPES: PlantType[] = [PlantType.THERMAL, PlantType.ELEVATOR, PlantType.FIRE_PROTECTION];

// Gli impianti non hanno CAP/comune propri: si geocodifica nel comune dell'ente.
export const PLANTS_MUNICIPALITY = 'Montesilvano';

export function computeNextDate(
  lastDate: string | null,
  periodMonths: number | null,
): string | null {
  if (!lastDate || !(Number(periodMonths) > 0)) return null;
  return addMonths(lastDate.slice(0, 10), Number(periodMonths));
}

export function inspectionStatus(nextDate: string | null, today: string): InspectionStatus {
  if (!nextDate) return InspectionStatus.NO_DATE;
  const next = nextDate.slice(0, 10);
  if (next < today) return InspectionStatus.OVERDUE;
  if (next <= addDays(today, INSPECTION_DUE_DAYS)) return InspectionStatus.DUE_SOON;
  return InspectionStatus.OK;
}

interface Coords {
  latitude: string | null;
  longitude: string | null;
  geocoded_latitude: string | null;
  geocoded_longitude: string | null;
}

export interface PositionInput extends Coords {
  asset: Coords | null;
}

const isSet = (v: string | null | undefined): v is string => v != null && v.trim() !== '';

function coords(c: Coords | null, kind: 'manual' | 'geocoded'): { lat: string; lng: string } | null {
  if (!c) return null;
  const [lat, lng] =
    kind === 'manual' ? [c.latitude, c.longitude] : [c.geocoded_latitude, c.geocoded_longitude];
  return isSet(lat) && isSet(lng) ? { lat, lng } : null;
}

// Tra gli immobili collegati, il primo con una posizione (manuale o geocodificata).
export function firstLocatedAsset<T extends Coords & { deleted?: boolean }>(
  assets: T[] | null | undefined,
): T | null {
  const live = (assets ?? []).filter((a) => !a.deleted);
  return live.find((a) => coords(a, 'manual') ?? coords(a, 'geocoded')) ?? null;
}

// Priorità: coordinate a mano → immobile collegato → geocodifica dell'impianto.
export function resolvePlantPosition(
  p: PositionInput,
): { lat: string; lng: string; quality: PositionQuality } | null {
  const manual = coords(p, 'manual');
  if (manual) return { ...manual, quality: PositionQuality.PRECISE };
  const fromAsset = coords(p.asset, 'manual') ?? coords(p.asset, 'geocoded');
  if (fromAsset) return { ...fromAsset, quality: PositionQuality.FROM_ASSET };
  const geocoded = coords(p, 'geocoded');
  if (geocoded) return { ...geocoded, quality: PositionQuality.ESTIMATED };
  return null;
}

export function positionQuality(p: PositionInput): PositionQuality {
  return resolvePlantPosition(p)?.quality ?? PositionQuality.MISSING;
}

// Periodicità proposte (indicative, modificabili dall'utente).
export function suggestedInspections(
  type: PlantType,
  powerKw?: number | null,
): { kind: string; period_months: number }[] {
  switch (type) {
    case PlantType.ELEVATOR:
      return [
        { kind: 'Verifica periodica (ente notificato)', period_months: 24 },
        { kind: 'Manutenzione ordinaria', period_months: 6 },
      ];
    case PlantType.FIRE_PROTECTION:
      return [
        { kind: 'Controllo periodico estintori', period_months: 6 },
        { kind: 'Controllo idranti e naspi', period_months: 6 },
      ];
    case PlantType.THERMAL:
      return [
        {
          kind: 'Controllo di efficienza energetica',
          period_months: Number(powerKw) > 100 ? 24 : 48,
        },
      ];
    case PlantType.PHOTOVOLTAIC:
      return [{ kind: 'Manutenzione / verifica impianto', period_months: 12 }];
    default:
      return [];
  }
}
