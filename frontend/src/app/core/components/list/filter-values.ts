import {DateHelper} from '../../helpers/date.helper';
import type {TOption} from '../../types/option.interface';
import {FilterChip, FilterDef, FilterValues} from './filter-def';

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.every(x => x === null || x === undefined || x === ''));

const isoDay = (v: unknown): string | null =>
  v instanceof Date ? DateHelper.toLocalIsoString(v) : typeof v === 'string' && v ? v.slice(0, 10) : null;

const itDay = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '');

const isDefault = (def: FilterDef, v: unknown): boolean =>
  def.defaultValue !== undefined && v === def.defaultValue;

// Valori iniziali: i default delle definizioni.
export function initialValues(defs: FilterDef[]): FilterValues {
  const out: FilterValues = {};
  for (const d of defs) if (d.defaultValue !== undefined) out[d.key] = d.defaultValue;
  return out;
}

// Oggetto passato a service.search(): niente vuoti, date AAAA-MM-GG, intervalli come array.
export function toSearchParams(defs: FilterDef[], values: FilterValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    const v = values[d.key];
    if (isEmpty(v)) continue;
    if (d.type === 'dateRange') {
      const [from, to] = (v as unknown[]) ?? [];
      out[d.key] = [isoDay(from), isoDay(to)].map(x => x ?? '');
    } else {
      out[d.key] = v;
    }
  }
  return out;
}

function optionLabel(options: TOption[] | undefined, v: unknown): string {
  return options?.find(o => o.value === v)?.label ?? String(v);
}

// Un chip per ogni filtro valorizzato e diverso dal suo default.
export function toChips(defs: FilterDef[], values: FilterValues, optionsByKey: Record<string, TOption[]>): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const d of defs) {
    const v = values[d.key];
    if (isEmpty(v) || isDefault(d, v)) continue;
    let text: string;
    switch (d.type) {
      case 'select':
      case 'bool':
        text = optionLabel(optionsByKey[d.key], v);
        break;
      case 'multi':
        text = (v as unknown[]).map(x => optionLabel(optionsByKey[d.key], x)).join(', ');
        break;
      case 'dateRange': {
        const [from, to] = (v as unknown[]).map(isoDay);
        text = from && to ? `${itDay(from)}–${itDay(to)}` : from ? `dal ${itDay(from)}` : `fino al ${itDay(to)}`;
        break;
      }
      default:
        text = String(v);
    }
    chips.push({key: d.key, text: `${d.label}: ${text}`});
  }
  return chips;
}

// Numero di filtri avanzati (non in linea) attivi, per il badge del pulsante.
export function countAdvanced(defs: FilterDef[], values: FilterValues): number {
  return defs.filter(d => !d.inline && !isEmpty(values[d.key]) && !isDefault(d, values[d.key])).length;
}

// Query param con lo stesso nome di un filtro → valore (link dalla dashboard).
export function fromQueryParams(defs: FilterDef[], params: Record<string, string | string[] | undefined>): FilterValues {
  const out: FilterValues = {};
  for (const d of defs) {
    const raw = params[d.key];
    if (raw === undefined || raw === '') continue;
    const s = Array.isArray(raw) ? raw.join(',') : raw;
    switch (d.type) {
      case 'bool':
        out[d.key] = s === 'true' || s === '1';
        break;
      case 'number':
        out[d.key] = Number(s);
        break;
      case 'multi':
        out[d.key] = s.split(',').filter(Boolean);
        break;
      case 'dateRange':
        out[d.key] = s.split(',').map(x => x || null);
        break;
      case 'select': {
        const opts = Array.isArray(d.options) ? d.options : null;
        const match = opts?.find(o => String(o.value) === s);
        out[d.key] = match ? match.value : /^\d+$/.test(s) ? Number(s) : s;
        break;
      }
      default:
        out[d.key] = s;
    }
  }
  return out;
}

// Toglie un filtro: torna al default, se c'è.
export function clearKey(defs: FilterDef[], values: FilterValues, key: string): FilterValues {
  const def = defs.find(d => d.key === key);
  const next = {...values};
  if (def?.defaultValue !== undefined) next[key] = def.defaultValue; else delete next[key];
  return next;
}
