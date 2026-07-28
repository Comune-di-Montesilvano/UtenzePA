export enum HardType {
  WATER = 'WATER',
  LIGHT = 'LIGHT',
  GAS = 'GAS',
  INTERNET = 'INTERNET',
}

export const HardTypeDescription: Record<HardType, string> = {
  [HardType.WATER]: 'Acqua',
  [HardType.LIGHT]: 'Luce',
  [HardType.GAS]: 'Gas',
  [HardType.INTERNET]: 'Internet',
};

const hardTypeValues = Object.values(HardType).filter((v): v is HardType => typeof v === 'string');

export const HardTypeOptions = hardTypeValues.map(value => ({
  label: HardTypeDescription[value],
  value
}));

export const HardTypeIcon: Record<HardType, string> = {
  [HardType.WATER]: 'fa fa-tint',
  [HardType.LIGHT]: 'fa fa-bolt',
  [HardType.GAS]: 'fa fa-fire',
  [HardType.INTERNET]: 'fa fa-globe',
};

export const HardTypeColor: Record<HardType, string> = {
  [HardType.WATER]: '#2196F3',  // blue
  [HardType.LIGHT]: '#FFC107',  // amber
  [HardType.GAS]: '#FF5722',    // deep orange
  [HardType.INTERNET]: '#4CAF50', // green
};

export namespace HardType {
  export function items(): { idx: number; label: string; icon: string; color: string; value: HardType }[] {
    return hardTypeValues.map((value, idx) => ({
      idx,
      label: HardTypeDescription[value],
      icon: HardTypeIcon[value],
      color: HardTypeColor[value],
      value,
    }));
  }
}
