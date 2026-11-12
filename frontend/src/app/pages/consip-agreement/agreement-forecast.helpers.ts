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

// Copertura sotto cui la stima del capitolo è incerta (gemella di
// MIN_ALERT_COVERAGE nel backend).
export const UNCERTAIN_COVERAGE = 0.6;

export interface PlanRow extends ForecastRow {
  // Da chiedere alla ragioneria: quanto resta da pagare oltre il disponibile.
  to_commit: number;
  // Disponibile che avanza dopo aver pagato il previsto.
  surplus: number;
  // Già speso sugli impegni (impegnato − rimanenza).
  spent: number;
  uncertain: boolean;
}

export interface PlanYear {
  year: number;
  open: boolean;
  rows: PlanRow[];
  // Capitoli senza nulla da pagare né disponibile: non mostrati.
  hidden: number;
  totals: {to_pay: number; available: number; to_commit: number; short_chapters: number};
}

// Piano degli impegni: esercizio in corso e successivi, dal più vicino;
// aperto l'esercizio in corso (o il primo). Da impegnare sommato capitolo per
// capitolo: l'avanzo di un capitolo non copre un altro.
export function planYears(rows: ForecastRow[], currentYear: number): PlanYear[] {
  const years = [...new Set(rows.map(r => r.year))].filter(y => y >= currentYear).sort((a, b) => a - b);
  return years.map((year, i) => {
    const all = rows.filter(r => r.year === year);
    const shown = all.filter(r => r.to_invoice !== 0 || r.remaining !== 0);
    const plan: PlanRow[] = shown.map(r => ({
      ...r,
      to_commit: round2(Math.max(0, r.to_invoice - r.remaining)),
      surplus: round2(Math.max(0, r.remaining - r.to_invoice)),
      spent: round2(r.committed - r.remaining),
      uncertain: r.to_invoice > 0 && r.coverage < UNCERTAIN_COVERAGE,
    }));
    const sum = (pick: (r: PlanRow) => number): number => round2(plan.reduce((s, r) => s + pick(r), 0));
    return {
      year,
      open: year === currentYear || (i === 0 && !years.includes(currentYear)),
      rows: plan,
      hidden: all.length - shown.length,
      totals: {
        to_pay: sum(r => r.to_invoice),
        available: sum(r => r.remaining),
        to_commit: sum(r => r.to_commit),
        short_chapters: plan.filter(r => r.to_commit > 0).length,
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

// Avvisi sopra la tabella: solo ciò che cambia il piano dall'esercizio in
// corso in poi, con cosa fare e su quali ordini o utenze.
export function forecastNotices(f: AgreementForecast, currentYear: number): string[] {
  const out: string[] = [];
  const w = f.warnings;
  const name = (u: ForecastUtilityRow): string => u.utility_code || `id ${u.id}`;
  const codes = (ids: number[]): string[] =>
    ids.map(id => f.utilities.find(u => u.id === id)).map((u, i) => (u ? name(u) : `id ${ids[i]}`));
  if (w.orders_without_dates.length) {
    out.push(`Ordini senza date di fornitura: ${w.orders_without_dates.length} (contratti id ${w.orders_without_dates.join(', ')}): completa le date nel contratto, altrimenti non entrano nel calcolo`);
  }
  if (w.utilities_without_data.length) out.push(`Utenze senza dati: ${listed(codes(w.utilities_without_data))}: previste a zero`);
  const loose = f.utilities.filter(u => u.lines_without_period);
  if (loose.length) {
    out.push(`Utenze con righe di fattura senza periodo: ${listed(loose.map(name))}: l’importo è nel fatturato ma i giorni restano da pagare`);
  }
  if (w.utilities_other_type.length) {
    out.push(`Utenze di altro tipo (acqua, connettività) escluse dal calcolo: ${w.utilities_other_type.length}`);
  }
  const withoutAmount = w.commitments_without_amount.filter(c => c.year >= currentYear);
  if (withoutAmount.length) {
    const list = withoutAmount.map(c => `${chapterLabelOf(f, c.chapter_id)} (${c.year}, ${c.count})`).join(', ');
    out.push(`Annualità di impegno senza importo: ${list}: contano come niente impegnato`);
  }
  if (f.shared_commitments.length) {
    out.push(`Impegni collegati anche a un'altra convenzione: ${listed(f.shared_commitments.map(c => c.label))}: il disponibile conta in entrambe, verifica che basti`);
  }
  for (const s of f.shares_without_lines.filter(x => x.year >= currentYear)) {
    const amount = s.amount.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
    out.push(`Fatture senza righe per utenza nel ${s.year}: ${amount} di canoni o servizi, non previsti per il resto dell’anno`);
  }
  return out;
}
