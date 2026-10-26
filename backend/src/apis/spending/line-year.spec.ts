import { invoiceCompetenceYear, lineFiscalYear, lineYearSql } from './line-year';

describe('lineFiscalYear', () => {
  it.each([
    ['2025-12-15', '2026-01-15', '2026-02-01', 2025],
    ['2025-12-17', '2026-01-15', '2026-02-01', 2026],
    [null, null, '2026-01-10', 2026],
    [null, '2025-12-31', '2026-01-20', 2025],
    ['2026-03-01', null, '2026-04-02', 2026],
    ['2026-01-01', '2026-02-28', '2026-03-10', 2026],
  ])('periodo %s–%s, fattura %s → %i', (start, end, invoiceDate, expected) => {
    expect(lineFiscalYear(start, end, invoiceDate)).toBe(expected);
  });

  it('accetta date con orario (valori Date serializzati dal driver)', () => {
    expect(lineFiscalYear('2025-12-15T00:00:00.000Z', null, '2026-01-02')).toBe(2025);
  });
});

describe('invoiceCompetenceYear', () => {
  it("usa il primo inizio e l'ultima fine delle righe", () => {
    const periods = [
      { period_start: '2025-12-20', period_end: '2026-01-05' },
      { period_start: '2025-11-01', period_end: '2025-12-19' },
      { period_start: null, period_end: null },
    ];
    // 2025-11-01 – 2026-01-05: più giorni nel 2025
    expect(invoiceCompetenceYear(periods, '2026-02-01')).toBe(2025);
  });

  it('senza periodi usa la data fattura', () => {
    expect(invoiceCompetenceYear([], '2026-02-01')).toBe(2026);
    expect(invoiceCompetenceYear([{ period_start: null, period_end: null }], '2027-03-01')).toBe(2027);
  });
});

describe('lineYearSql', () => {
  it('usa gli alias passati per periodo e data fattura', () => {
    const sql = lineYearSql({ line: 'il', invoice: 'i' });
    expect(sql).toContain('il.period_start');
    expect(sql).toContain('il.period_end');
    expect(sql).toContain('i.invoice_date');
  });
});
