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
  notes: string | null;
}

export interface MonthlyPoint {
  month: string;
  actual: number;
  covered_days: number;
  days: number;
  estimated: number;
}

export interface ConsumptionSummary {
  unit: string | null;
  actual_consumption: number;
  coverage_days: number;
  estimated_annual_consumption: number;
  estimated_source: EstimateSource;
  estimated_valid_until: string | null;
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

export function formatDateIt(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// Data locale (non UTC): un Date del datepicker a mezzanotte locale con
// toISOString() slitterebbe al giorno prima.
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
