import type {ForecastRow, ForecastSource, ForecastUtilityRow} from './agreement-forecast.model';

export const SOURCE_LABEL: Record<ForecastSource, string> = {
  history: 'Storico dei consumi',
  annual: 'Presunto annuo',
  spend: 'Stima dalla sola spesa',
  none: 'Senza dati',
};

export function unitLabel(hardType: string): string {
  if (hardType === 'LIGHT') return '€/kWh';
  if (hardType === 'GAS') return '€/Smc';
  return '€/unità';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ForecastYearGroup {
  year: number;
  open: boolean;
  rows: ForecastRow[];
  totals: ForecastRow;
}

// Righe per esercizio, dal più recente; aperto l'esercizio in corso o, se non
// ha righe, il più recente. Totali: somma delle colonne, copertura media
// pesata sulle utenze.
export function yearGroups(rows: ForecastRow[], currentYear: number): ForecastYearGroup[] {
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a);
  const openYear = years.includes(currentYear) ? currentYear : years[0];
  return years.map(year => {
    const list = rows.filter(r => r.year === year);
    const sum = (pick: (r: ForecastRow) => number): number => round2(list.reduce((s, r) => s + pick(r), 0));
    const utilities = list.reduce((s, r) => s + r.utilities, 0);
    const missing = list.filter(r => r.shortfall !== null);
    return {
      year,
      open: year === openYear,
      rows: list,
      totals: {
        chapter_id: null,
        year,
        utilities,
        invoiced: sum(r => r.invoiced),
        to_invoice: sum(r => r.to_invoice),
        total: sum(r => r.total),
        committed: sum(r => r.committed),
        remaining: sum(r => r.remaining),
        difference: sum(r => r.difference),
        coverage: utilities
          ? Math.round((list.reduce((s, r) => s + r.coverage * r.utilities, 0) / utilities) * 10000) / 10000
          : 0,
        shortfall: missing.length ? round2(missing.reduce((s, r) => s + (r.shortfall ?? 0), 0)) : null,
        alert: null,
      },
    };
  });
}

export function differenceTone(row: ForecastRow): 'danger' | 'warning' | null {
  if (row.alert === 'short') return 'danger';
  if (row.alert === 'insufficient_data') return 'warning';
  return null;
}

export interface ForecastUtilityYear {
  id: number;
  utility_code: string | null;
  hard_type: string | null;
  source: ForecastSource;
  from_draft: boolean;
  invoiced: number;
  to_invoice: number;
  expected_consumption: number | null;
}

// Utenze di un capitolo (null = senza capitolo) con dati nell'esercizio.
export function utilitiesOf(utilities: ForecastUtilityRow[], chapterId: number | null, year: number): ForecastUtilityYear[] {
  const out: ForecastUtilityYear[] = [];
  for (const u of utilities) {
    if (u.chapter_id !== chapterId) continue;
    const y = u.years.find(v => v.year === year);
    if (!y) continue;
    out.push({
      id: u.id,
      utility_code: u.utility_code,
      hard_type: u.hard_type,
      source: u.source,
      from_draft: u.from_draft,
      invoiced: y.invoiced,
      to_invoice: y.to_invoice,
      expected_consumption: y.expected_consumption,
    });
  }
  return out.sort((a, b) => (a.utility_code ?? '').localeCompare(b.utility_code ?? '', 'it'));
}
