import {
  FireEquipmentType,
  GroundingClass,
  InspectionStatus,
  PlantStatus,
  PlantType,
  PositionQuality,
} from './enum/plant.enum';
import { thermalPlantObligations } from './thermal-plant-obligations';
import { addDays, addMonths } from '@apis/utilizer-grant/real-estate-contract.calc';

export const INSPECTION_DUE_DAYS = 60;

// Tipi che stanno sempre dentro un edificio: senza immobile collegato sono un'anomalia.
export const ASSET_REQUIRED_TYPES: PlantType[] = [PlantType.THERMAL, PlantType.ELEVATOR, PlantType.FIRE_PROTECTION];

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

// DPR 462/01: verifica periodica dell'impianto di terra (e delle scariche
// atmosferiche, se presenti) ogni 2 anni nei luoghi a maggior rischio o con
// pericolo di esplosione, ogni 5 negli altri.
export const GROUNDING_PERIOD_MONTHS: Record<GroundingClass, number> = {
  [GroundingClass.ORDINARY]: 60,
  [GroundingClass.HIGH_RISK]: 24,
  [GroundingClass.EXPLOSION]: 24,
};
export const GROUNDING_INSPECTION_KIND = 'Messa a terra (DPR 462/01)';
export const LIGHTNING_INSPECTION_KIND = 'Scariche atmosferiche (DPR 462/01)';

const sameKind = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Periodicità delle verifiche DPR 462/01 già registrate da allineare alla
// classificazione della scheda elettrica. Non ne crea: una verifica si
// registra con il suo verbale; quelle mancanti le segnala missingInspections.
export function electricalPeriodUpdates(
  e: { grounding_class?: GroundingClass | null } | null | undefined,
  existing: { id: number; kind: string; period_months: number | null; deleted?: boolean }[],
): { id: number; period_months: number }[] {
  if (!e?.grounding_class) return [];
  const period = GROUNDING_PERIOD_MONTHS[e.grounding_class];
  return existing
    .filter(
      (i) =>
        !i.deleted &&
        i.period_months !== period &&
        [GROUNDING_INSPECTION_KIND, LIGHTNING_INSPECTION_KIND].some((k) => sameKind(i.kind, k)),
    )
    .map((i) => ({ id: i.id, period_months: period }));
}

export const ELEVATOR_INSPECTION_KIND = 'Verifica periodica (ente notificato)';
export const EFFICIENCY_INSPECTION_KIND = 'Controllo di efficienza energetica';

export interface RequiredInspection {
  kind: string;
  // null = dipende da un dato non ancora indicato (classificazione elettrica).
  period_months: number | null;
  law: string;
}

export interface RequiredInspectionInput {
  type: PlantType;
  status?: PlantStatus | null;
  electrical?: { grounding_class?: GroundingClass | null; lightning_protection?: boolean | null } | null;
  thermal?: { power_kw?: number | string | null } | null;
}

// Verifiche periodiche obbligatorie per legge, per tipo d'impianto: ascensori
// (DPR 162/99), impianto elettrico (DPR 462/01: terra; scariche atmosferiche se
// c'è la protezione), termico (DPR 74/2013, da 10 kW). Antincendio escluso: i
// presidi hanno le loro scadenze. Impianti dismessi esclusi.
export function requiredInspections(p: RequiredInspectionInput): RequiredInspection[] {
  if (p.status === PlantStatus.DECOMMISSIONED) return [];
  switch (p.type) {
    case PlantType.ELEVATOR:
      return [{ kind: ELEVATOR_INSPECTION_KIND, period_months: 24, law: 'DPR 162/99' }];
    case PlantType.ELECTRICAL_SYSTEM: {
      const cls = p.electrical?.grounding_class;
      const period = cls ? GROUNDING_PERIOD_MONTHS[cls] : null;
      return [
        { kind: GROUNDING_INSPECTION_KIND, period_months: period, law: 'DPR 462/01' },
        ...(p.electrical?.lightning_protection
          ? [{ kind: LIGHTNING_INSPECTION_KIND, period_months: period, law: 'DPR 462/01' }]
          : []),
      ];
    }
    case PlantType.THERMAL: {
      const kw = p.thermal?.power_kw;
      if (!thermalPlantObligations(kw === null || kw === undefined ? null : Number(kw)).efficiency_check_required) {
        return [];
      }
      return [{ kind: EFFICIENCY_INSPECTION_KIND, period_months: Number(kw) > 100 ? 24 : 48, law: 'DPR 74/2013' }];
    }
    default:
      return [];
  }
}

// Obbligatorie senza una verifica registrata con lo stesso nome (spazi e
// maiuscole ignorati) e almeno una data (ultima o prossima).
export function missingInspections(
  p: RequiredInspectionInput,
  inspections: { kind: string; last_date?: string | null; next_date?: string | null; deleted?: boolean }[],
): RequiredInspection[] {
  const dated = inspections.filter((i) => !i.deleted && (i.last_date || i.next_date));
  return requiredInspections(p).filter((r) => !dated.some((i) => sameKind(i.kind, r.kind)));
}

// Periodicità proposte (indicative, modificabili dall'utente).
export function suggestedInspections(
  type: PlantType,
  powerKw?: number | null,
): { kind: string; period_months: number }[] {
  switch (type) {
    case PlantType.ELEVATOR:
      return [
        { kind: ELEVATOR_INSPECTION_KIND, period_months: 24 },
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
          kind: EFFICIENCY_INSPECTION_KIND,
          period_months: Number(powerKw) > 100 ? 24 : 48,
        },
      ];
    case PlantType.PHOTOVOLTAIC:
      return [{ kind: 'Manutenzione / verifica impianto', period_months: 12 }];
    default:
      return [];
  }
}
