import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import {
  ARERA_CATEGORIES_BY_HARD_TYPE,
  AreraCategory,
  isAreraCategoryAllowed,
} from './arera-category';

describe('arera-category', () => {
  it('ogni codice appartiene a un solo tipo, coerente col prefisso', () => {
    const prefix: Record<HardTypeEnum, string> = {
      [HardTypeEnum.LIGHT]: 'EL_',
      [HardTypeEnum.WATER]: 'WATER_',
      [HardTypeEnum.GAS]: 'GAS_',
      [HardTypeEnum.INTERNET]: '-',
    };
    const all = Object.values(AreraCategory);
    for (const code of all) {
      const owners = Object.values(HardTypeEnum).filter((t) => isAreraCategoryAllowed(t, code));
      expect(owners).toHaveLength(1);
      expect(code.startsWith(prefix[owners[0]])).toBe(true);
    }
    const mapped = Object.values(ARERA_CATEGORIES_BY_HARD_TYPE).flat();
    expect(mapped.sort()).toEqual([...all].sort());
    expect(all).toHaveLength(19);
  });

  it('Internet non ha tipologie', () => {
    expect(ARERA_CATEGORIES_BY_HARD_TYPE[HardTypeEnum.INTERNET]).toEqual([]);
    expect(isAreraCategoryAllowed(HardTypeEnum.INTERNET, AreraCategory.EL_BT_OTHER)).toBe(false);
  });

  it('rifiuta un codice di un altro tipo', () => {
    expect(isAreraCategoryAllowed(HardTypeEnum.GAS, AreraCategory.WATER_OTHER)).toBe(false);
    expect(isAreraCategoryAllowed(HardTypeEnum.WATER, AreraCategory.WATER_OTHER)).toBe(true);
  });
});
