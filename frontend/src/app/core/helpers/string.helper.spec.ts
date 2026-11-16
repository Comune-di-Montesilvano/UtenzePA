import {StringHelper} from './string.helper';

describe('StringHelper.truncateAt', () => {
  it('taglia oltre la lunghezza massima e aggiunge i puntini', () => {
    expect(StringHelper.truncateAt('abcdef', 4)).toBe('abcd…');
    expect(StringHelper.truncateAt('abcdef', 4, '...')).toBe('abcd...');
  });

  it('lascia invariato un testo che sta nella lunghezza', () => {
    expect(StringHelper.truncateAt('abcd', 4)).toBe('abcd');
  });

  it('valori vuoti: stringa vuota', () => {
    expect(StringHelper.truncateAt(null, 4)).toBe('');
    expect(StringHelper.truncateAt(undefined, 4)).toBe('');
    expect(StringHelper.truncateAt('', 4)).toBe('');
  });
});
