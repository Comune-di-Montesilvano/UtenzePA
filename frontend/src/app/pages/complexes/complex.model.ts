import type {Asset} from '../assets/entity/asset.entity';

// Gemello di backend/src/apis/complexes/enum/complex-type.enum.ts:
// tipi di compendio dei domini MEF 2025.
export type ComplexType =
  | 'ROAD_HOUSE' | 'MILITARY' | 'HEALTHCARE' | 'SCHOOL_UNIVERSITY' | 'HISTORIC_CULTURAL'
  | 'SPORTS_RECREATIONAL' | 'RESIDENTIAL_BUILDING' | 'OFFICE_BUILDING' | 'SOCIAL_HOUSING_BUILDING'
  | 'PRISON' | 'OTHER_COMPLEX' | 'OTHER_BUILDING' | 'LAND_ONLY';

export const COMPLEX_TYPE_LABEL: Record<ComplexType, string> = {
  ROAD_HOUSE: 'Compendio casa cantoniera',
  MILITARY: 'Compendio militare',
  HEALTHCARE: 'Compendio sanitario/riabilitativo',
  SCHOOL_UNIVERSITY: 'Compendio universitario/scolastico',
  HISTORIC_CULTURAL: 'Complesso a valore storico/religioso/culturale',
  SPORTS_RECREATIONAL: 'Complesso sportivo/ricreativo',
  RESIDENTIAL_BUILDING: 'Edificio/palazzina cielo-terra uso residenziale',
  OFFICE_BUILDING: 'Edificio/palazzina cielo-terra uso ufficio',
  SOCIAL_HOUSING_BUILDING: 'Edificio/palazzina di case popolari',
  PRISON: 'Complesso carcerario',
  OTHER_COMPLEX: 'Complesso, altro tipo',
  OTHER_BUILDING: 'Edificio/palazzina cielo-terra, altro tipo',
  LAND_ONLY: 'Compendio di soli terreni',
};
export const COMPLEX_TYPES = Object.keys(COMPLEX_TYPE_LABEL) as ComplexType[];

export interface Complex {
  id: number;
  name: string;
  complex_type: ComplexType | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  latitude: string | null;
  longitude: string | null;
  mef_compendium_id: number | null;
  notes: string | null;
  assets?: Asset[];
  asset_count: number;
  utility_count: number;
  plant_count: number;
  active_grant_count: number;
  update_date?: string;
  updated_by?: {firstName?: string | null; lastName?: string | null} | null;
}

export interface ComplexPayload {
  name: string;
  complex_type: ComplexType | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  latitude: string | null;
  longitude: string | null;
  mef_compendium_id: number | null;
  notes: string | null;
  asset_ids?: number[];
}
