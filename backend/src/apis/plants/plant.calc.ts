import { FireEquipmentType, InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';
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

// Ultimo giorno del mese: una scadenza mm/aaaa vale fino a fine mese.
export function monthEnd(iso: string): string {
  return addDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);
}

export interface FireDeadlineInput {
  equipment_type: string;
  last_check_on: string | null;
  revision_due_on: string | null;
  test_due_on: string | null;
  deleted?: boolean;
}

type FireDeadlineKind = 'Controllo' | 'Revisione' | 'Collaudo';

// Scadenze di un estintore (gemello frontend: fireEquipmentDeadlinesOf in
// plant.model.ts; gemello SQL: anomalia plants_fire_equipment_overdue).
export function fireEquipmentDeadlines(
  e: FireDeadlineInput,
): { kind: FireDeadlineKind; due: string }[] {
  if (e.equipment_type !== FireEquipmentType.EXTINGUISHER) return [];
  const out: { kind: FireDeadlineKind; due: string }[] = [];
  if (e.last_check_on) {
    out.push({ kind: 'Controllo', due: monthEnd(addMonths(e.last_check_on.slice(0, 10), 6)) });
  }
  if (e.revision_due_on) out.push({ kind: 'Revisione', due: monthEnd(e.revision_due_on) });
  if (e.test_due_on) out.push({ kind: 'Collaudo', due: monthEnd(e.test_due_on) });
  return out;
}

const STATUS_SEVERITY = [
  InspectionStatus.OVERDUE,
  InspectionStatus.DUE_SOON,
  InspectionStatus.OK,
  InspectionStatus.NO_DATE,
];
const worstStatus = (statuses: InspectionStatus[]): InspectionStatus | null =>
  STATUS_SEVERITY.find((s) => statuses.includes(s)) ?? null;

// Stato di un presidio: solo gli estintori hanno scadenze (la peggiore vince).
export function fireEquipmentStatus(e: FireDeadlineInput, today: string): InspectionStatus | null {
  if (e.equipment_type !== FireEquipmentType.EXTINGUISHER) return null;
  const deadlines = fireEquipmentDeadlines(e);
  if (deadlines.length === 0) return InspectionStatus.NO_DATE;
  return worstStatus(deadlines.map((d) => inspectionStatus(d.due, today)));
}

export function plantFireEquipmentStatus(
  list: FireDeadlineInput[],
  today: string,
): InspectionStatus | null {
  return worstStatus(
    list
      .filter((e) => !e.deleted)
      .map((e) => fireEquipmentStatus(e, today))
      .filter((s): s is InspectionStatus => s !== null),
  );
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
