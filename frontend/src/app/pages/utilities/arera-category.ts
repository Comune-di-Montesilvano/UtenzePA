import {HardType, HardTypeDescription} from '../utility-types/enum/hard-type.enum';
import {TOption} from '../../core/types/option.interface';

// Gemello di backend/src/apis/utility/arera-category.ts: stessi codici.
export enum AreraCategory {
  EL_BT_DOMESTIC = 'EL_BT_DOMESTIC',
  EL_BT_PUBLIC_LIGHTING = 'EL_BT_PUBLIC_LIGHTING',
  EL_BT_OTHER = 'EL_BT_OTHER',
  EL_BT_EV_CHARGING = 'EL_BT_EV_CHARGING',
  EL_MT_PUBLIC_LIGHTING = 'EL_MT_PUBLIC_LIGHTING',
  EL_MT_OTHER = 'EL_MT_OTHER',
  WATER_DOMESTIC_RESIDENT = 'WATER_DOMESTIC_RESIDENT',
  WATER_DOMESTIC_NON_RESIDENT = 'WATER_DOMESTIC_NON_RESIDENT',
  WATER_DOMESTIC_CONDOMINIUM = 'WATER_DOMESTIC_CONDOMINIUM',
  WATER_INDUSTRIAL = 'WATER_INDUSTRIAL',
  WATER_COMMERCIAL = 'WATER_COMMERCIAL',
  WATER_AGRICULTURAL = 'WATER_AGRICULTURAL',
  WATER_PUBLIC_NON_DISCONNECTABLE = 'WATER_PUBLIC_NON_DISCONNECTABLE',
  WATER_PUBLIC_DISCONNECTABLE = 'WATER_PUBLIC_DISCONNECTABLE',
  WATER_OTHER = 'WATER_OTHER',
  GAS_DOMESTIC = 'GAS_DOMESTIC',
  GAS_CONDOMINIUM_DOMESTIC = 'GAS_CONDOMINIUM_DOMESTIC',
  GAS_PUBLIC_SERVICE = 'GAS_PUBLIC_SERVICE',
  GAS_OTHER = 'GAS_OTHER',
}

export const ARERA_NONE = 'NONE';

// Categoria d'uso del gas (delibera 229/2012/R/gas), distinta dalla
// tipologia di cliente TIVG. Gemello di GasUseCategory nel backend.
export enum GasUseCategory {
  C1 = 'C1',
  C2 = 'C2',
  C3 = 'C3',
  C4 = 'C4',
  C5 = 'C5',
  T1 = 'T1',
  T2 = 'T2',
}

export const GAS_USE_CATEGORY_LABEL: Record<GasUseCategory, string> = {
  [GasUseCategory.C1]: 'C1 – Riscaldamento',
  [GasUseCategory.C2]: 'C2 – Cottura cibi e/o acqua calda sanitaria',
  [GasUseCategory.C3]: 'C3 – Riscaldamento + cottura e/o acqua calda',
  [GasUseCategory.C4]: 'C4 – Condizionamento',
  [GasUseCategory.C5]: 'C5 – Condizionamento + riscaldamento',
  [GasUseCategory.T1]: 'T1 – Uso tecnologico (artigianale/industriale)',
  [GasUseCategory.T2]: 'T2 – Uso tecnologico + riscaldamento',
};

export const GAS_USE_OPTIONS: TOption[] = Object.values(GasUseCategory)
  .map(c => ({label: GAS_USE_CATEGORY_LABEL[c], value: c}));

export const ARERA_CATEGORY_LABEL: Record<AreraCategory, string> = {
  [AreraCategory.EL_BT_DOMESTIC]: 'BT usi domestici',
  [AreraCategory.EL_BT_PUBLIC_LIGHTING]: 'BT illuminazione pubblica',
  [AreraCategory.EL_BT_OTHER]: 'BT altri usi',
  [AreraCategory.EL_BT_EV_CHARGING]: 'BT ricarica veicoli elettrici in luoghi pubblici (BTVE)',
  [AreraCategory.EL_MT_PUBLIC_LIGHTING]: 'MT illuminazione pubblica',
  [AreraCategory.EL_MT_OTHER]: 'MT altri usi',
  [AreraCategory.WATER_DOMESTIC_RESIDENT]: 'Domestico residente',
  [AreraCategory.WATER_DOMESTIC_NON_RESIDENT]: 'Domestico non residente',
  [AreraCategory.WATER_DOMESTIC_CONDOMINIUM]: 'Domestico condominiale',
  [AreraCategory.WATER_INDUSTRIAL]: 'Industriale',
  [AreraCategory.WATER_COMMERCIAL]: 'Artigianale e commerciale',
  [AreraCategory.WATER_AGRICULTURAL]: 'Agricolo e zootecnico',
  [AreraCategory.WATER_PUBLIC_NON_DISCONNECTABLE]: 'Pubblico non disalimentabile',
  [AreraCategory.WATER_PUBLIC_DISCONNECTABLE]: 'Pubblico disalimentabile',
  [AreraCategory.WATER_OTHER]: 'Altri usi',
  [AreraCategory.GAS_DOMESTIC]: 'Domestico',
  [AreraCategory.GAS_CONDOMINIUM_DOMESTIC]: 'Condominio uso domestico',
  [AreraCategory.GAS_PUBLIC_SERVICE]: 'Attività di servizio pubblico',
  [AreraCategory.GAS_OTHER]: 'Usi diversi',
};

const byPrefix = (prefix: string) =>
  Object.values(AreraCategory).filter(c => c.startsWith(prefix));

export const ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardType, AreraCategory[]> = {
  [HardType.LIGHT]: byPrefix('EL_'),
  [HardType.WATER]: byPrefix('WATER_'),
  [HardType.GAS]: byPrefix('GAS_'),
  [HardType.INTERNET]: [],
};

const toOption = (c: AreraCategory): TOption => ({label: ARERA_CATEGORY_LABEL[c], value: c});

export function areraOptionsFor(hardType: HardType | null): TOption[] {
  return hardType ? ARERA_CATEGORIES_BY_HARD_TYPE[hardType].map(toOption) : [];
}

// Per il filtro senza tipo scelto: tutte le tipologie raggruppate per tipo.
export function areraGroups(): {label: string; options: TOption[]}[] {
  return [HardType.LIGHT, HardType.WATER, HardType.GAS].map(t => ({
    label: HardTypeDescription[t],
    options: areraOptionsFor(t),
  }));
}

export function areraLabel(code: string | null | undefined): string {
  return code ? ARERA_CATEGORY_LABEL[code as AreraCategory] ?? code : '';
}

// Non TOption: value null (= non noto) non è ammesso lì.
export const DISCONNECTABLE_OPTIONS: {label: string; value: boolean | null}[] = [
  {label: 'Sì', value: true},
  {label: 'No', value: false},
  {label: 'Non noto', value: null},
];
