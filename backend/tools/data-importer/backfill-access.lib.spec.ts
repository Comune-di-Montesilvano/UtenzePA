import {
  hasMultilineField,
  normalizeCoordinate,
  parseItalianDate,
  parseItalianDecimal,
  truncatedTextFix,
} from './backfill-access.lib';

describe('backfill-access.lib', () => {
  describe('parseItalianDate', () => {
    it.each([
      ['24.9.2026', '2026-09-24'],
      ['14.03.2026', '2026-03-14'],
      ['30/04/2026', '2026-04-30'],
      ['1/1/2000', '2000-01-01'],
      [' 31.12.2031 ', '2031-12-31'],
      ['2027-12-31 00:00:00', '2027-12-31'],
      ['2027-12-31', '2027-12-31'],
    ])('%s → %s', (input, expected) => {
      expect(parseItalianDate(input)).toBe(expected);
    });

    it.each(['indeterminata', 'Az. 28/04/2028 e Conc. 23/11/2023', '31/02/2026', '', '2026'])(
      '%s → null (testo libero o data inesistente)',
      (input) => {
        expect(parseItalianDate(input)).toBeNull();
      },
    );
  });

  describe('parseItalianDecimal', () => {
    it('virgola decimale e punto delle migliaia', () => {
      expect(parseItalianDecimal('16,38')).toBe(16.38);
      expect(parseItalianDecimal('1.234,5')).toBe(1234.5);
      expect(parseItalianDecimal('306.96')).toBe(306.96);
      expect(parseItalianDecimal('')).toBeNull();
      expect(parseItalianDecimal('n.d.')).toBeNull();
    });
  });

  describe('normalizeCoordinate', () => {
    it('virgola → punto, vuoto → null', () => {
      expect(normalizeCoordinate('42,509751902864')).toBe('42.509751902864');
      expect(normalizeCoordinate(' 42.38 ')).toBe('42.38');
      expect(normalizeCoordinate('')).toBeNull();
    });
  });

  describe('truncatedTextFix', () => {
    it('DB vuoto: valore Access', () => {
      expect(truncatedTextFix(null, 'riga 1\nriga 2')).toEqual({ value: 'riga 1\nriga 2', conflict: false });
    });

    it('DB troncato al primo a capo: testo completo da Access', () => {
      expect(truncatedTextFix('INTESTATO ENTE', 'INTESTATO ENTE\nMONTESILVANO')).toEqual({
        value: 'INTESTATO ENTE\nMONTESILVANO',
        conflict: false,
      });
    });

    it('DB già completo: nessuna modifica', () => {
      expect(truncatedTextFix('a\nb', 'a\nb')).toEqual({ value: null, conflict: false });
    });

    it('DB modificato in produzione (non prefisso): nessuna modifica, conflitto segnalato', () => {
      expect(truncatedTextFix('testo riscritto a mano', 'INTESTATO ENTE\nMONTESILVANO')).toEqual({
        value: null,
        conflict: true,
      });
    });

    it('Access vuoto: nessuna modifica', () => {
      expect(truncatedTextFix('qualcosa', '  ')).toEqual({ value: null, conflict: false });
    });
  });

  describe('hasMultilineField', () => {
    it('vero se almeno un campo contiene un a capo', () => {
      expect(hasMultilineField({ a: 'x', b: 'y\nz' })).toBe(true);
      expect(hasMultilineField({ a: 'x', b: 'y' })).toBe(false);
    });
  });
});
