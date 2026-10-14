import {HardType} from '../../utility-types/enum/hard-type.enum';

export type ConsumptionKind = 'READING' | 'PERIOD';
export type EstimateSource = 'MANUAL' | 'HISTORY' | 'NONE';

export interface UtilityConsumption {
  id: number;
  utility_id_fk: number;
  kind: ConsumptionKind;
  reading_date: string | null;
  reading_value: number | null;
  meter_number: string | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  consumption_f0: number | null;
  consumption_f1: number | null;
  consumption_f2: number | null;
  consumption_f3: number | null;
  reactive_penalty: boolean | null;
  source: 'MANUAL' | 'INVOICE' | 'IMPORT' | 'API';
  notes: string | null;
  computed_consumption: number | null;
}

export interface ConsumptionPayload {
  kind: ConsumptionKind;
  reading_date: string | null;
  reading_value: number | null;
  meter_number: string | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  // Solo per i periodi delle utenze elettriche: assenti = invariati.
  consumption_f0?: number | null;
  consumption_f1?: number | null;
  consumption_f2?: number | null;
  consumption_f3?: number | null;
  reactive_penalty?: boolean | null;
  notes: string | null;
}

export type BandKey = 'F0' | 'F1' | 'F2' | 'F3';

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
  // Solo utenze con dati per fascia: parte del reale/stimato per fascia
  // (il resto del totale è «non ripartito»).
  bands?: Partial<Record<BandKey, number>>;
  estimated_bands?: Partial<Record<BandKey, number>>;
}

export interface ConsumptionSummary {
  unit: string | null;
  meter_number: string | null;
  actual_consumption: number;
  coverage_days: number;
  estimated_annual_consumption: number;
  estimated_source: EstimateSource;
  estimated_valid_until: string | null;
  estimated_set_at: string | null;
  monthly: MonthlyPoint[];
}

export interface ChapterConsumptionSummaryRow {
  hard_type: HardType;
  unit: string | null;
  utilities_count: number;
  estimated_sum: number;
  actual_sum: number;
}

export const CONSUMPTION_UNIT_BY_HARD_TYPE: Record<HardType, string | null> = {
  [HardType.LIGHT]: 'kWh',
  [HardType.GAS]: 'Smc',
  [HardType.WATER]: 'm³',
  [HardType.INTERNET]: null,
};

// Nessun LOCALE_ID registrato nell'app: formattazione italiana esplicita.
export function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  const text = Number(value).toLocaleString('it-IT', {maximumFractionDigits: 2});
  return unit ? `${text} ${unit}` : text;
}

// Fasce in forma compatta per la tabella: «F1 1.234 · F2 567 · F3 890» (F0 solo se valorizzata).
export function bandsLabel(
  r: Pick<UtilityConsumption, 'consumption_f0' | 'consumption_f1' | 'consumption_f2' | 'consumption_f3'>,
): string {
  return ([['F0', r.consumption_f0], ['F1', r.consumption_f1], ['F2', r.consumption_f2], ['F3', r.consumption_f3]] as const)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k} ${formatQty(v)}`)
    .join(' · ');
}

export function formatDateIt(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Spostata in core (usata anche dalle schede): resta esportata da qui.
export {toIsoDate} from '../../../core/helpers/date.helper';
