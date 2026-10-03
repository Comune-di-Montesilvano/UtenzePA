import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

// Tipologie contrattuali ARERA per tipo di utenza: TIT (luce, art. 2.2 +
// BTVE), TICSI delibera 665/2017 (acqua), TIVG art. 2.3 (gas). Elenco
// fisso da normativa: nessuna anagrafica gestita dall'app.
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

// Valore del filtro di ricerca "tipologia non assegnata".
export const ARERA_NONE = 'NONE';

const byPrefix = (prefix: string) =>
  Object.values(AreraCategory).filter((c) => c.startsWith(prefix));

export const ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardTypeEnum, AreraCategory[]> = {
  [HardTypeEnum.LIGHT]: byPrefix('EL_'),
  [HardTypeEnum.WATER]: byPrefix('WATER_'),
  [HardTypeEnum.GAS]: byPrefix('GAS_'),
  [HardTypeEnum.INTERNET]: [],
};

export function isAreraCategoryAllowed(hardType: HardTypeEnum, category: AreraCategory): boolean {
  return ARERA_CATEGORIES_BY_HARD_TYPE[hardType]?.includes(category) ?? false;
}

// Categoria d'uso del gas (delibera 229/2012/R/gas): profilo di prelievo del
// PDR, distinta dalla tipologia di cliente TIVG qui sopra. Solo utenze gas.
export enum GasUseCategory {
  C1 = 'C1',
  C2 = 'C2',
  C3 = 'C3',
  C4 = 'C4',
  C5 = 'C5',
  T1 = 'T1',
  T2 = 'T2',
}
