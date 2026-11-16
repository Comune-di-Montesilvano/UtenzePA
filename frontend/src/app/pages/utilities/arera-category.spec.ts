import {HardType} from '../utility-types/enum/hard-type.enum';
import {ARERA_CATEGORY_LABEL, ARERA_NONE, AreraCategory, areraGroups, areraLabel, areraOptionsFor} from './arera-category';

describe('categorie ARERA', () => {
  it('ogni tipo di utenza propone solo le categorie del suo prefisso', () => {
    const values = (t: HardType) => areraOptionsFor(t).map(o => o.value as string);
    expect(values(HardType.LIGHT).every(v => v.startsWith('EL_'))).toBe(true);
    expect(values(HardType.WATER).every(v => v.startsWith('WATER_'))).toBe(true);
    expect(values(HardType.GAS).every(v => v.startsWith('GAS_'))).toBe(true);
    expect(values(HardType.INTERNET)).toEqual([]);
  });

  it('ogni categoria compare in esattamente un tipo', () => {
    const all = [HardType.LIGHT, HardType.WATER, HardType.GAS, HardType.INTERNET].flatMap(t =>
      areraOptionsFor(t).map(o => o.value),
    );
    expect(all.sort()).toEqual(Object.values(AreraCategory).sort());
  });

  it('senza tipo: nessuna opzione; i gruppi del filtro coprono luce, acqua e gas', () => {
    expect(areraOptionsFor(null)).toEqual([]);
    expect(areraGroups().flatMap(g => g.options).length).toBe(Object.values(AreraCategory).length);
  });

  it('etichetta: testo della categoria, codice sconosciuto così com’è, vuoto se assente', () => {
    expect(areraLabel(AreraCategory.GAS_DOMESTIC)).toBe(ARERA_CATEGORY_LABEL[AreraCategory.GAS_DOMESTIC]);
    expect(areraLabel('XYZ')).toBe('XYZ');
    expect(areraLabel(ARERA_NONE)).toBe(ARERA_NONE);
    expect(areraLabel(null)).toBe('');
    expect(areraLabel(undefined)).toBe('');
  });
});
