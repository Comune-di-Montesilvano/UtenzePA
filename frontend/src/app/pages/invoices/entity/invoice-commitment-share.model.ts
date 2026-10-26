import type {CommitmentRef} from '../../commitments/commitment.model';

// Origine della quota: ricalcolo automatico, scelta a mano o (in futuro) ragioneria.
export type CommitmentShareSource = 'AUTO' | 'MANUAL' | 'ACCOUNTING';

export const SHARE_SOURCE_LABELS: Record<CommitmentShareSource, string> = {
  AUTO: 'Automatica',
  MANUAL: 'A mano',
  ACCOUNTING: 'Ragioneria',
};

// Quota della fattura su un'annualità di un impegno (GET /invoices: commitmentShares).
export interface InvoiceCommitmentShare {
  id?: number;
  commitment_id_fk: number;
  fiscal_year: number | null;
  amount: number;
  source?: CommitmentShareSource;
  commitment?: CommitmentRef | null;
}

// Solo i campi che il backend accetta (whitelist + forbidNonWhitelisted).
export const toSharePayload = (s: InvoiceCommitmentShare): Pick<InvoiceCommitmentShare, 'commitment_id_fk' | 'fiscal_year' | 'amount'> => ({
  commitment_id_fk: Number(s.commitment_id_fk),
  fiscal_year: s.fiscal_year ?? null,
  amount: Number(s.amount),
});

// Gemella di backend budget-commitments/annuality.ts: annualità dell'anno di
// competenza, altrimenti la più vicina (a parità, la precedente).
export function annualityFor(years: number[], year: number): number | null {
  if (!years.length) return null;
  if (years.includes(year)) return year;
  return [...years].sort((a, b) => Math.abs(a - year) - Math.abs(b - year) || a - b)[0];
}

// Gemella di backend spending/line-year.ts (lineFiscalYear + invoiceCompetenceYear):
// competenza = periodo complessivo delle righe (primo inizio, ultima fine),
// a cavallo d'anno l'anno con più giorni (parità = anno di fine); senza
// periodo l'anno della data fattura.
const day = (v: string): string => String(v).slice(0, 10);
const yearOf = (v: string): number => Number(day(v).slice(0, 4));
const utc = (v: string): number => {
  const [y, m, d] = day(v).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const DAY_MS = 24 * 60 * 60 * 1000;

export function invoiceCompetenceYear(
  periods: {period_start: string | null; period_end: string | null}[],
  invoiceDate: string | null,
): number | null {
  const days = (values: (string | null)[]) => values.filter((v): v is string => !!v).map(day).sort();
  const start = days(periods.map(p => p.period_start))[0] ?? null;
  const ends = days(periods.map(p => p.period_end));
  const end = ends[ends.length - 1] ?? null;
  if (start && end) {
    const startYear = yearOf(start);
    const endYear = yearOf(end);
    if (startYear === endYear) return endYear;
    const inStartYear = (Date.UTC(startYear + 1, 0, 1) - utc(start)) / DAY_MS;
    const inEndYear = (utc(end) - Date.UTC(endYear, 0, 1)) / DAY_MS + 1;
    return inStartYear > inEndYear ? startYear : endYear;
  }
  const only = end ?? start ?? invoiceDate;
  return only ? yearOf(only) : null;
}
