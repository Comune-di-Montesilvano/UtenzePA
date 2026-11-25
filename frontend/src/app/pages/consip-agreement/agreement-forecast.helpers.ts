import type {AgreementForecast, ForecastSource, ForecastUtilityRow} from './agreement-forecast.model';

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

// Richiesta alla ragioneria per un esercizio: per capitolo, quanto si spende
// nell'anno prima (fatture arrivate + stima fino a fine anno) e quanto servirà
// nell'esercizio (stima dell'anno intero), contro lo stanziamento.
export interface RequestRow {
  chapter_id: number | null;
  // Utenze del capitolo in tutte le convenzioni attive.
  utilities: number;
  // Quota di questa convenzione nell'esercizio della richiesta.
  own_utilities: number;
  own: number;
  // Altre convenzioni con utenze sul capitolo (anno prima o esercizio).
  agreements: string[];
  // Anno prima: stanziamento, fatture arrivate, stima dei giorni non fatturati.
  base_budget: number | null;
  base_billed: number;
  base_expected: number;
  base_total: number;
  // Esercizio della richiesta.
  budget: number | null;
  need: number;
  // need − stanziamento: + da aggiungere, − che avanza; null senza stanziamento.
  request: number | null;
  uncertain: boolean;
  // Utenze attive del capitolo fuori dalla convenzione (lo stanziamento paga anche loro).
  other_utilities: number;
}

export interface RequestPlan {
  year: number;
  rows: RequestRow[];
  totals: {
    base_budget: number;
    base_total: number;
    budget: number;
    need: number;
    increase: number;
    increase_chapters: number;
    decrease: number;
    decrease_chapters: number;
    without_budget: number;
  };
}

// Il fabbisogno è del capitolo, con tutte le convenzioni attive su di esso
// (chapter_needs): lo stanziamento è uno solo. Righe in ordine: prima chi
// chiede di più, poi chi avanza, in fondo chi non ha stanziamento.
export function requestPlan(f: AgreementForecast, year: number): RequestPlan {
  const ownOf = (chapter: number | null, y: number) => f.annual.find(a => a.chapter_id === chapter && a.year === y);
  const annualOf = (chapter: number | null, y: number) =>
    f.chapter_needs.find(n => n.chapter_id === chapter && n.year === y) ?? ownOf(chapter, y);
  const agreementLabel = (id: number): string => f.agreements.find(a => a.id === id)?.label ?? `Convenzione id ${id}`;
  const budgetOf = (chapter: number | null, y: number): number | null =>
    chapter === null ? null : f.budgets.find(b => b.chapter_id === chapter && b.year === y)?.budget ?? null;
  const chapters = [...new Set(f.annual.filter(a => a.year === year || a.year === year - 1).map(a => a.chapter_id))];
  const rows: RequestRow[] = chapters.map(chapter => {
    const now = annualOf(chapter, year);
    const before = annualOf(chapter, year - 1);
    const mine = ownOf(chapter, year);
    const need = round2((now?.billed ?? 0) + (now?.expected ?? 0));
    const budget = budgetOf(chapter, year);
    const others = [...new Set(f.chapter_needs
      .filter(n => n.chapter_id === chapter && (n.year === year || n.year === year - 1))
      .flatMap(n => n.agreements))];
    const shared = f.chapter_needs.find(n => n.chapter_id === chapter && n.year === year);
    return {
      chapter_id: chapter,
      utilities: now?.utilities ?? before?.utilities ?? 0,
      own_utilities: shared ? shared.own_utilities : mine?.utilities ?? 0,
      own: shared ? shared.own : round2((mine?.billed ?? 0) + (mine?.expected ?? 0)),
      agreements: others.sort((a, b) => a - b).map(agreementLabel),
      base_budget: budgetOf(chapter, year - 1),
      base_billed: round2(before?.billed ?? 0),
      base_expected: round2(before?.expected ?? 0),
      base_total: round2((before?.billed ?? 0) + (before?.expected ?? 0)),
      budget,
      need,
      request: budget === null ? null : round2(need - budget),
      uncertain: need > 0 && (mine?.coverage ?? 0) < UNCERTAIN_COVERAGE,
      other_utilities: chapter === null ? 0 : f.chapter_other_utilities.find(o => o.chapter_id === chapter)?.count ?? 0,
    };
  }).sort((a, b) => (b.request ?? -Infinity) - (a.request ?? -Infinity));
  const sum = (pick: (r: RequestRow) => number | null): number => round2(rows.reduce((s, r) => s + (pick(r) ?? 0), 0));
  return {
    year,
    rows,
    totals: {
      base_budget: sum(r => r.base_budget),
      base_total: sum(r => r.base_total),
      budget: sum(r => r.budget),
      need: sum(r => r.need),
      increase: sum(r => Math.max(0, r.request ?? 0)),
      increase_chapters: rows.filter(r => (r.request ?? 0) > 0).length,
      decrease: sum(r => Math.max(0, -(r.request ?? 0))),
      decrease_chapters: rows.filter(r => (r.request ?? 0) < 0).length,
      without_budget: rows.filter(r => r.request === null).length,
    },
  };
}

export interface Move {
  from: number | null;
  to: number | null;
  amount: number;
}

export interface MovePlan {
  moves: Move[];
  // Quanto si toglie da ogni capitolo che avanza e quanto si mette su ogni
  // capitolo che chiede (chapter_id → importo).
  taken: Map<number | null, number>;
  given: Map<number | null, number>;
  // Quanto manca dopo gli spostamenti: fabbisogno da finanziare.
  extra: number;
  // Quanto avanza ancora sui capitoli usati.
  leftover: number;
}

// Spostamenti tra capitoli: l'avanzo dei capitoli non esclusi copre chi chiede,
// dal più grande al più grande; quello che resta scoperto è fabbisogno extra.
export function simulateMoves(rows: RequestRow[], excluded: ReadonlySet<number | null>): MovePlan {
  const donors = rows
    .filter(r => (r.request ?? 0) < 0 && !excluded.has(r.chapter_id))
    .map(r => ({id: r.chapter_id, left: -(r.request as number)}))
    .sort((a, b) => b.left - a.left);
  const takers = rows
    .filter(r => (r.request ?? 0) > 0)
    .map(r => ({id: r.chapter_id, left: r.request as number}))
    .sort((a, b) => b.left - a.left);
  const moves: Move[] = [];
  const taken = new Map<number | null, number>();
  const given = new Map<number | null, number>();
  for (const t of takers) {
    for (const d of donors) {
      if (t.left <= 0) break;
      if (d.left <= 0) continue;
      const amount = round2(Math.min(t.left, d.left));
      moves.push({from: d.id, to: t.id, amount});
      t.left = round2(t.left - amount);
      d.left = round2(d.left - amount);
      taken.set(d.id, round2((taken.get(d.id) ?? 0) + amount));
      given.set(t.id, round2((given.get(t.id) ?? 0) + amount));
    }
  }
  return {
    moves,
    taken,
    given,
    extra: round2(takers.reduce((s, t) => s + t.left, 0)),
    leftover: round2(donors.reduce((s, d) => s + d.left, 0)),
  };
}

// Utenze di un capitolo (null = senza capitolo) per la richiesta di un
// esercizio: spesa dell'anno prima e fabbisogno dell'esercizio, dalla più cara.
export interface RequestUtility {
  id: number;
  utility_code: string | null;
  source: ForecastSource;
  from_draft: boolean;
  base_billed: number;
  base_expected: number;
  need: number;
}

export function requestUtilities(utilities: ForecastUtilityRow[], chapterId: number | null, year: number): RequestUtility[] {
  const out: RequestUtility[] = [];
  for (const u of utilities) {
    if (u.chapter_id !== chapterId) continue;
    const now = u.annual.find(a => a.year === year);
    const before = u.annual.find(a => a.year === year - 1);
    if (!now && !before) continue;
    out.push({
      id: u.id,
      utility_code: u.utility_code,
      source: u.source,
      from_draft: u.from_draft,
      base_billed: before?.billed ?? 0,
      base_expected: before?.expected ?? 0,
      need: round2((now?.billed ?? 0) + (now?.expected ?? 0)),
    });
  }
  return out.sort((a, b) => b.need - a.need);
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
