import {formatMonths} from './stats-months';

describe('formatMonths', () => {
  it('raggruppa i mesi consecutivi, anche a cavallo d\'anno', () => {
    expect(formatMonths(['2026-01', '2026-02', '2026-03', '2026-06'])).toBe('gen–mar 2026, giu 2026');
    expect(formatMonths(['2026-02', '2025-11', '2025-12', '2026-01'])).toBe('nov 2025–feb 2026');
  });

  it('vuoto senza mesi', () => {
    expect(formatMonths([])).toBe('');
  });
});
