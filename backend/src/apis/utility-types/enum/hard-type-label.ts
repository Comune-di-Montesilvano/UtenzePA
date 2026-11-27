import { HardTypeEnum } from './hard-type.enum';

// Natura della spesa in chiaro (messaggi, anomalie).
export const HARD_TYPE_LABEL: Record<HardTypeEnum, string> = {
  [HardTypeEnum.LIGHT]: 'Luce',
  [HardTypeEnum.GAS]: 'Gas',
  [HardTypeEnum.WATER]: 'Acqua',
  [HardTypeEnum.INTERNET]: 'Internet',
};

export const hardTypeLabel = (t: HardTypeEnum | null | undefined): string =>
  t ? HARD_TYPE_LABEL[t] : 'tutte le nature';
