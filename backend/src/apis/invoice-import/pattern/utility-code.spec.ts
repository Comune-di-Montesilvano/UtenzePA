import { normalizeUtilityCode } from './utility-code';

describe('normalizeUtilityCode', () => {
  it('PDR più corto: zeri a sinistra fino a 14 cifre', () => {
    expect(normalizeUtilityCode('0123456789012')).toBe('00123456789012');
    expect(normalizeUtilityCode(' 12345678901 ')).toBe('00012345678901');
  });

  it('POD: maiuscolo, senza spazi, 15 caratteri ridotti a 14', () => {
    expect(normalizeUtilityCode('it001e 00000001')).toBe('IT001E00000001');
    expect(normalizeUtilityCode('IT001E000000012')).toBe('IT001E00000001');
  });

  it('codici brevi (servizio ACA) invariati', () => {
    expect(normalizeUtilityCode('123456')).toBe('123456');
  });
});
