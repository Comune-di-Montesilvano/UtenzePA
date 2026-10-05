export type PlantType = 'THERMAL' | 'ELEVATOR' | 'FIRE_PROTECTION' | 'PHOTOVOLTAIC' | 'PUBLIC_LIGHTING'
  | 'TRAFFIC_LIGHT' | 'LIFTING_PUMP' | 'FOUNTAIN' | 'ELECTRICAL_CABIN' | 'WATER_KIOSK' | 'VIDEO_SURVEILLANCE'
  | 'BIKE_STATION' | 'POWER_POINT' | 'WATER_POINT' | 'SEWAGE' | 'IRRIGATION' | 'POWERED_STREET_FURNITURE'
  | 'COMPACTOR' | 'STORMWATER';
export type PlantStatus = 'ACTIVE' | 'DECOMMISSIONED' | 'TO_VERIFY';
export type InspectionStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'NO_DATE';
export type PositionQuality = 'PRECISE' | 'FROM_ASSET' | 'ESTIMATED' | 'MISSING';
export type FireEquipmentType = 'EXTINGUISHER' | 'HYDRANT' | 'HOSE_REEL' | 'FIRE_BRIGADE_CONNECTION';

export const PLANT_TYPE_LABEL: Record<PlantType, string> = {
  THERMAL: 'Termico',
  ELEVATOR: 'Ascensore',
  FIRE_PROTECTION: 'Antincendio',
  PHOTOVOLTAIC: 'Fotovoltaico',
  PUBLIC_LIGHTING: 'Pubblica illuminazione',
  TRAFFIC_LIGHT: 'Semaforo',
  LIFTING_PUMP: 'Pompa di sollevamento',
  FOUNTAIN: 'Fontana',
  ELECTRICAL_CABIN: 'Cabina elettrica',
  WATER_KIOSK: "Casetta dell'acqua",
  VIDEO_SURVEILLANCE: 'Videosorveglianza e antenne',
  BIKE_STATION: 'Bike station',
  POWER_POINT: 'Punto presa / alimentazione eventi',
  WATER_POINT: "Presa d'acqua",
  SEWAGE: 'Depurazione e fognatura',
  IRRIGATION: 'Irrigazione',
  POWERED_STREET_FURNITURE: 'Arredo urbano alimentato',
  COMPACTOR: 'Ecocompattatore',
  STORMWATER: 'Impianto raccolta acque meteoriche',
};

// Ligature Material Icons.
export const PLANT_TYPE_ICON: Record<PlantType, string> = {
  THERMAL: 'local_fire_department',
  ELEVATOR: 'elevator',
  FIRE_PROTECTION: 'fire_extinguisher',
  PHOTOVOLTAIC: 'solar_power',
  PUBLIC_LIGHTING: 'light',
  TRAFFIC_LIGHT: 'traffic',
  LIFTING_PUMP: 'waves',
  FOUNTAIN: 'water_drop',
  ELECTRICAL_CABIN: 'electrical_services',
  WATER_KIOSK: 'local_drink',
  VIDEO_SURVEILLANCE: 'videocam',
  BIKE_STATION: 'pedal_bike',
  POWER_POINT: 'power',
  WATER_POINT: 'water',
  SEWAGE: 'plumbing',
  IRRIGATION: 'grass',
  POWERED_STREET_FURNITURE: 'signpost',
  COMPACTOR: 'recycling',
  STORMWATER: 'thunderstorm',
};

export const PLANT_TYPES = Object.keys(PLANT_TYPE_LABEL) as PlantType[];

export const PLANT_STATUS_LABEL: Record<PlantStatus, string> = {
  ACTIVE: 'Attivo',
  DECOMMISSIONED: 'Dismesso',
  TO_VERIFY: 'Da verificare',
};

// Tab specifici per tipo d'impianto (oltre a Riepilogo/Immobili/Utenze/Foto/
// Storico, sempre presenti). Un tipo nuovo dichiara qui i suoi tab.
export type PlantTab = 'technical' | 'fire_equipment' | 'inspections';
const DEFAULT_PLANT_TABS: PlantTab[] = ['inspections'];
export const PLANT_TYPE_TABS: Partial<Record<PlantType, PlantTab[]>> = {
  THERMAL: ['technical', 'inspections'],
  ELEVATOR: ['technical', 'inspections'],
  FIRE_PROTECTION: ['fire_equipment', 'inspections'],
};
export function plantTabs(type: PlantType): PlantTab[] {
  return PLANT_TYPE_TABS[type] ?? DEFAULT_PLANT_TABS;
}

export const POSITION_LABEL: Record<PositionQuality, string> = {
  PRECISE: 'Precisa',
  FROM_ASSET: "Dall'immobile",
  ESTIMATED: 'Stimata',
  MISSING: 'Assente',
};

export const INSPECTION_LABEL: Record<InspectionStatus, string> = {
  OVERDUE: 'Scaduta',
  DUE_SOON: 'Entro 60 giorni',
  OK: 'In regola',
  NO_DATE: 'Senza data',
};

export const FIRE_EQUIPMENT_LABEL: Record<FireEquipmentType, string> = {
  EXTINGUISHER: 'Estintore',
  HYDRANT: 'Idrante',
  HOSE_REEL: 'Naspo',
  FIRE_BRIGADE_CONNECTION: 'Attacco VVF',
};

// Periodicità proposte (stessa tabella di suggestedInspections nel backend).
export function suggestedInspections(type: PlantType, powerKw?: number | null): {kind: string; period_months: number}[] {
  switch (type) {
    case 'ELEVATOR':
      return [
        {kind: 'Verifica periodica (ente notificato)', period_months: 24},
        {kind: 'Manutenzione ordinaria', period_months: 6},
      ];
    case 'FIRE_PROTECTION':
      return [
        {kind: 'Controllo periodico estintori', period_months: 6},
        {kind: 'Controllo idranti e naspi', period_months: 6},
      ];
    case 'THERMAL':
      return [{kind: 'Controllo di efficienza energetica', period_months: Number(powerKw) > 100 ? 24 : 48}];
    case 'PHOTOVOLTAIC':
      return [{kind: 'Manutenzione / verifica impianto', period_months: 12}];
    default:
      return [];
  }
}

export type Badge = {bg: string; fg: string};
const GREEN: Badge = {bg: '#dcfce7', fg: '#166534'};
const AMBER: Badge = {bg: '#fef3c7', fg: '#92400e'};
const RED: Badge = {bg: '#fee2e2', fg: '#991b1b'};
const GREY: Badge = {bg: '#f3f4f6', fg: '#374151'};

export function positionBadge(q: PositionQuality): Badge {
  return q === 'PRECISE' || q === 'FROM_ASSET' ? GREEN : q === 'ESTIMATED' ? AMBER : RED;
}

export function inspectionBadge(s: InspectionStatus | null): Badge {
  return s === 'OVERDUE' ? RED : s === 'DUE_SOON' ? AMBER : s === 'OK' ? GREEN : GREY;
}

const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

// Spostata in core (usata anche dalle schede): resta esportata da qui.
import {todayIso} from '../../core/helpers/date.helper';
export {todayIso};

// Stessa regola del backend (inspectionStatus, 60 giorni).
export function inspectionStatusOf(nextDate: string | null, today = todayIso()): InspectionStatus {
  if (!nextDate) return 'NO_DATE';
  const next = nextDate.slice(0, 10);
  if (next < today) return 'OVERDUE';
  if (next <= addDaysIso(today, 60)) return 'DUE_SOON';
  return 'OK';
}

// Stato di una certificazione rispetto all'obbligo derivato dalla potenza.
export function certificationStatus(required: boolean, exempt: boolean, value: string | null): Badge & {text: string} {
  if (value?.trim()) return {text: value.trim(), ...GREEN};
  if (exempt) return {text: 'Esente', ...GREY};
  if (required) return {text: 'Richiesta, mancante', ...RED};
  return {text: 'Non richiesta', ...GREY};
}

export interface PlantInspection {
  id: number;
  plant_id: number;
  kind: string;
  period_months: number | null;
  last_date: string | null;
  next_date: string | null;
  provider: string | null;
  outcome: string | null;
  notes: string | null;
}

export type PlantInspectionPayload = Omit<PlantInspection, 'id' | 'plant_id'>;

export interface PlantFireEquipment {
  id: number;
  plant_id: number;
  equipment_type: FireEquipmentType;
  serial_number: string | null;
  agent: string | null;
  capacity: string | null;
  location: string | null;
  notes: string | null;
}

export type PlantFireEquipmentPayload = Omit<PlantFireEquipment, 'id' | 'plant_id'>;

export interface PlantThermalData {
  power_kw: number | null;
  generators_description: string | null;
  vvf_certification: string | null;
  vvf_exempt: boolean;
  inail_certification: string | null;
  inail_exempt: boolean;
  served_area_sqm: number | null;
  water_room: boolean | null;
  outdoor_units: number | null;
  indoor_units: number | null;
  fan_coils: number | null;
  air_handling_units: number | null;
  chillers_heat_pumps: number | null;
}

export interface PlantElevatorData {
  serial_number: string | null;
  plant_number: string | null;
  manufacturer: string | null;
  year: number | null;
  test_date: string | null;
  elevator_type: string | null;
  drive: string | null;
  capacity_kg: number | null;
  stops: number | null;
  speed: string | null;
}

export interface PlantPayload {
  type: PlantType;
  code: string;
  name: string;
  asset_ids: number[];
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  latitude: string | null;
  longitude: string | null;
  status: PlantStatus;
  notes: string | null;
  utility_ids: number[];
  thermal?: PlantThermalData | null;
  elevator?: PlantElevatorData | null;
}

export interface ThermalObligations {
  efficiency_check_required: boolean;
  inail_required: boolean;
  vvf_required: boolean;
}

export interface Plant extends Omit<PlantPayload, 'utility_ids' | 'asset_ids' | 'thermal' | 'elevator'> {
  id: number;
  geocoded_latitude: string | null;
  geocoded_longitude: string | null;
  assets: {id: number; asset_name: string; associated_building?: string | null; address?: string | null}[];
  utilities: {id: number; utility_id: string}[];
  thermal: PlantThermalData | null;
  elevator: PlantElevatorData | null;
  inspections: PlantInspection[];
  fireEquipment: PlantFireEquipment[];
  position: {lat: string; lng: string} | null;
  position_quality: PositionQuality;
  inspection_status: InspectionStatus | null;
  obligations?: ThermalObligations;
  updated_by?: {firstName?: string; lastName?: string} | null;
  update_date?: string;
}

export interface PlantSummary {
  by_type: Partial<Record<PlantType, number>>;
  inspections_overdue: number;
  inspections_due_soon: number;
  without_position: number;
}

// Certificazioni termiche richieste dalla potenza ma né registrate né esenti.
export function missingCertifications(p: Plant): string[] {
  const t = p.thermal;
  const o = p.obligations;
  if (!t || !o) return [];
  const missing: string[] = [];
  if (o.vvf_required && !t.vvf_exempt && !t.vvf_certification?.trim()) missing.push('VVF');
  if (o.inail_required && !t.inail_exempt && !t.inail_certification?.trim()) missing.push('INAIL');
  return missing;
}

export const formatDateIt = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
