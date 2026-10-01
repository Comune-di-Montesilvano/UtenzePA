import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

// INTERNET non ha contatore: escluso da consumi e totali.
export const CONSUMPTION_UNIT: Record<HardTypeEnum, string | null> = {
  [HardTypeEnum.LIGHT]: 'kWh',
  [HardTypeEnum.GAS]: 'Smc',
  [HardTypeEnum.WATER]: 'm³',
  [HardTypeEnum.INTERNET]: null,
};
