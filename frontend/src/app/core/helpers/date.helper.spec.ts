import {DateHelper, toIsoDate} from './date.helper';

// Fuso orario del processo cambiato per un test (Node rilegge TZ a ogni Date).
// Niente tipi di Node nel tsconfig dell'app: process letto da globalThis.
const env = (globalThis as unknown as {process: {env: Record<string, string | undefined>}}).process.env;

function inTimeZone(tz: string, fn: () => void): void {
  const previous = env['TZ'];
  env['TZ'] = tz;
  try {
    fn();
  } finally {
    if (previous === undefined) delete env['TZ'];
    else env['TZ'] = previous;
  }
}

const parts = (d: Date | null) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('DateHelper.isoToLocalDate', () => {
  it('legge AAAA-MM-GG come giorno locale, anche il giorno del cambio d’ora', () => {
    inTimeZone('Europe/Rome', () => {
      expect(parts(DateHelper.isoToLocalDate('2026-03-29'))).toEqual([2026, 3, 29]);
      expect(parts(DateHelper.isoToLocalDate('2026-10-25'))).toEqual([2026, 10, 25]);
    });
  });

  it('non slitta al giorno prima nei fusi a ovest di UTC', () => {
    inTimeZone('America/New_York', () => {
      expect(parts(DateHelper.isoToLocalDate('2026-01-01'))).toEqual([2026, 1, 1]);
    });
  });

  it('accetta anche una data con orario (resta il giorno locale)', () => {
    inTimeZone('Europe/Rome', () => {
      expect(parts(DateHelper.isoToLocalDate('2026-05-10T15:30:00'))).toEqual([2026, 5, 10]);
    });
  });

  it('valori vuoti o non validi: null', () => {
    expect(DateHelper.isoToLocalDate(null)).toBeNull();
    expect(DateHelper.isoToLocalDate(undefined)).toBeNull();
    expect(DateHelper.isoToLocalDate('')).toBeNull();
    expect(DateHelper.isoToLocalDate('abc')).toBeNull();
  });
});

describe('date locali in uscita', () => {
  it('toIsoDate e toLocalIsoString usano il giorno locale, non UTC', () => {
    inTimeZone('Europe/Rome', () => {
      expect(toIsoDate(new Date(2026, 9, 25))).toBe('2026-10-25');
      expect(DateHelper.toLocalIsoString(new Date(2026, 0, 1))).toBe('2026-01-01');
    });
  });

  it('toLocalIsoString(null): null', () => {
    expect(DateHelper.toLocalIsoString(null)).toBeNull();
  });
});
