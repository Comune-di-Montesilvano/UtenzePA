import type {AgreementForecast, ForecastRow, ForecastSource, ForecastUtilityRow} from './agreement-forecast.model';

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

export function chapterLabelOf(f: AgreementForecast, id: number | null): string {
  return id === null ? 'Senza capitolo' : f.chapters.find(c => c.id === id)?.label ?? `Capitolo id ${id}`;
}

// «N (a, b, c)»: al massimo dieci nomi, il resto contato.
function listed(names: string[]): string {
  const shown = names.slice(0, 10).join(', ');
  return `${names.length} (${names.length > 10 ? `${shown} e altre ${names.length - 10}` : shown})`;
}

// Avvisi sopra la tabella: tutto ciò che rende la stima meno precisa, con gli
// ordini e le utenze interessate.
export function forecastNotices(f: AgreementForecast): string[] {
  const out: string[] = [];
  const w = f.warnings;
  const name = (u: ForecastUtilityRow): string => u.utility_code || `id ${u.id}`;
  const codes = (ids: number[]): string[] =>
    ids.map(id => f.utilities.find(u => u.id === id)).map((u, i) => (u ? name(u) : `id ${ids[i]}`));
  if (w.orders_without_dates.length) {
    out.push(`Ordini senza date di fornitura valide: ${w.orders_without_dates.length} (contratti id ${w.orders_without_dates.join(', ')}): non entrano nel calcolo`);
  }
  if (w.utilities_without_data.length) out.push(`Utenze senza dati: ${listed(codes(w.utilities_without_data))}`);
  const loose = f.utilities.filter(u => u.lines_without_period);
  if (loose.length) {
    out.push(`Utenze con righe di fattura senza periodo: ${listed(loose.map(name))}: l’importo è nel fatturato ma i giorni restano da fatturare`);
  }
  if (w.utilities_other_type.length) {
    out.push(`Utenze di altro tipo (acqua, connettività) escluse dal calcolo: ${w.utilities_other_type.length}`);
  }
  if (f.shared_commitments.length) {
    out.push(`Impegni condivisi con un'altra convenzione: ${f.shared_commitments.map(c => c.label).join(', ')} (contano per intero in entrambe)`);
  }
  const insufficient = f.rows.filter(r => r.alert === 'insufficient_data');
  if (insufficient.length) {
    out.push(`Dati insufficienti per l'avviso: ${insufficient.map(r => `${chapterLabelOf(f, r.chapter_id)} (${r.year})`).join(', ')}`);
  }
  for (const s of f.shares_without_lines) {
    const amount = s.amount.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
    out.push(`Quote su fatture senza righe per utenza: ${amount} (${s.year})`);
  }
  return out;
}
