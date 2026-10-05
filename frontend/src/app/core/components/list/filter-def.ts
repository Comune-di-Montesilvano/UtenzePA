import {Observable} from 'rxjs';
import type {TOption} from '../../types/option.interface';

export type FilterType = 'select' | 'multi' | 'text' | 'bool' | 'dateRange' | 'number';

// Un filtro di elenco: chiave = parametro di ricerca dell'API.
export interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  // select/multi: opzioni statiche o caricate (una volta per pagina).
  options?: TOption[] | (() => Observable<TOption[]>);
  // In barra accanto alla ricerca (max 3 per pagina); sempre anche negli avanzati.
  inline?: boolean;
  // Sezione del dialog avanzato.
  group?: string;
  // Valore di partenza (es. deleted=false); un filtro al suo default non fa chip.
  defaultValue?: unknown;
}

export type FilterValues = Record<string, unknown>;

export interface FilterChip {
  key: string;
  text: string;
}

export const BOOL_OPTIONS: TOption[] = [
  {label: 'Sì', value: true},
  {label: 'No', value: false},
];

// Solo negli elenchi con Ripristina.
export const DELETED_FILTER: FilterDef = {
  key: 'deleted',
  label: 'Mostra',
  type: 'select',
  group: 'Record',
  defaultValue: false,
  options: [
    {label: 'Attivi', value: false},
    {label: 'Eliminati', value: true},
  ],
};
