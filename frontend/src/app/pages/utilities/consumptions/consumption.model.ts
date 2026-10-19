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
  // Valore stimato dal fornitore; superseded = stima che non conta più
  // (è arrivato il dato reale).
  is_estimated: boolean;
  superseded: boolean;
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
  is_estimated: boolean;
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
  // Finestra dei 12 mesi: fino all'ultimo dato, se è dell'ultimo anno.
  window_start: string;
  window_end: string;
  // Periodi senza dati tra il primo e l'ultimo dato.
  gaps: {start: string; end: string}[];
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

// Quantità compatta per badge: kWh con i multipli veri (1,2 MWh, 1,2 GWh),
// Smc e m³ col suffisso k (1,2k Smc); sotto 1.000 il numero intero.
export function compactQty(value: number, unit: string | null): string {
  const n = Math.round(value);
  const one = (x: number) => x.toLocaleString('it-IT', {maximumFractionDigits: 1});
  const withUnit = (text: string, u: string | null) => (u ? `${text} ${u}` : text);
  if (Math.abs(n) < 1000) return withUnit(n.toLocaleString('it-IT'), unit);
  if (unit === 'kWh') return Math.abs(n) < 1_000_000 ? `${one(n / 1000)} MWh` : `${one(n / 1_000_000)} GWh`;
  return Math.abs(n) < 1_000_000 ? withUnit(`${one(n / 1000)}k`, unit) : withUnit(`${one(n / 1_000_000)}M`, unit);
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
