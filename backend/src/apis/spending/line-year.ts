// Esercizio di una riga di fattura = competenza effettiva: anno del periodo
// della riga. Periodo a cavallo d'anno: l'anno con più giorni (parità = anno
// di fine); solo inizio o solo fine: quell'anno; senza periodo: anno della
// data fattura. Gemella SQL in lineYearSql (stesse regole; su periodi di 3+
// anni confronta solo l'anno di inizio con quello di fine).

const day = (v: string): string => String(v).slice(0, 10);
const yearOf = (v: string): number => Number(day(v).slice(0, 4));
const utc = (v: string): number => {
  const [y, m, d] = day(v).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY_MS = 24 * 60 * 60 * 1000;

export function lineFiscalYear(
  periodStart: string | null,
  periodEnd: string | null,
  invoiceDate: string,
): number {
  if (periodStart && periodEnd) {
    const startYear = yearOf(periodStart);
    const endYear = yearOf(periodEnd);
    if (startYear === endYear) return endYear;
    const inStartYear = (Date.UTC(startYear + 1, 0, 1) - utc(periodStart)) / DAY_MS;
    const inEndYear = (utc(periodEnd) - Date.UTC(endYear, 0, 1)) / DAY_MS + 1;
    return inStartYear > inEndYear ? startYear : endYear;
  }
  const only = periodEnd ?? periodStart;
  return yearOf(only ?? invoiceDate);
}

// Competenza di una fattura: periodo complessivo delle righe (primo inizio,
// ultima fine), altrimenti data fattura.
export function invoiceCompetenceYear(
  periods: { period_start: string | null; period_end: string | null }[],
  invoiceDate: string,
): number {
  const days = (values: (string | null)[]) =>
    values.filter((v): v is string => !!v).map(day).sort();
  const starts = days(periods.map((p) => p.period_start));
  const ends = days(periods.map((p) => p.period_end));
  return lineFiscalYear(starts[0] ?? null, ends[ends.length - 1] ?? null, invoiceDate);
}

export function lineYearSql(alias: { line: string; invoice: string }): string {
  const s = `${alias.line}.period_start`;
  const e = `${alias.line}.period_end`;
  return `(CASE
    WHEN ${s} IS NOT NULL AND ${e} IS NOT NULL AND YEAR(${s}) <> YEAR(${e})
      THEN IF(DATEDIFF(MAKEDATE(YEAR(${s}) + 1, 1), ${s}) > DATEDIFF(${e}, MAKEDATE(YEAR(${e}), 1)) + 1, YEAR(${s}), YEAR(${e}))
    ELSE YEAR(COALESCE(${e}, ${s}, ${alias.invoice}.invoice_date))
  END)`;
}
