// Gemelli di backend/src/apis/spending/agreement-forecast.ts e della risposta
// di GET /consip-agreement/:id/forecast.

export type ForecastSource = 'history' | 'annual' | 'spend' | 'none';

export interface ForecastUtilityRow {
  id: number;
  utility_code: string | null;
  hard_type: string | null;
  chapter_id: number | null;
  source: ForecastSource;
  // Conta solo grazie a ordini in bozza.
  from_draft: boolean;
  lines_without_period: boolean;
  years: {year: number; invoiced: number; to_invoice: number; expected_consumption: number | null}[];
  // Spesa dell'anno intero: fatture arrivate e stima dei giorni non fatturati.
  annual: {year: number; billed: number; expected: number}[];
}

// Spesa dell'anno intero per capitolo (anno prima, in corso e dopo), come se la
// fornitura continuasse anche dopo la scadenza degli ordini.
export interface AnnualRow {
  chapter_id: number | null;
  year: number;
  utilities: number;
  billed: number;
  expected: number;
  // Quota dei giorni da fatture o da consumi/presunto (non dalla sola spesa).
  coverage: number;
}

export interface ForecastRow {
  // null = utenze senza capitolo.
  chapter_id: number | null;
  year: number;
  utilities: number;
  invoiced: number;
  to_invoice: number;
  total: number;
  committed: number;
  remaining: number;
  // Rimanenza − previsto da fatturare: negativa = manca.
  difference: number;
  // Quota dei giorni calcolati da fatture o dallo storico dei consumi.
  coverage: number;
  // Importo mancante, solo se scatta l'avviso.
  shortfall: number | null;
  alert: 'short' | 'insufficient_data' | null;
}

export interface ForecastPrice {
  hard_type: string;
  proposed: number | null;
  manual: number | null;
  used: number | null;
  trend: number;
}

export interface AgreementForecast {
  horizon: {start: string; end: string} | null;
  // Ultimo giorno coperto da una riga di fattura delle utenze.
  billed_until: string | null;
  annual: AnnualRow[];
  prices: ForecastPrice[];
  rows: ForecastRow[];
  utilities: ForecastUtilityRow[];
  warnings: {
    orders_without_dates: number[];
    utilities_without_data: number[];
    utilities_other_type: number[];
    // Annualità di impegno senza importo: contano come niente impegnato.
    commitments_without_amount: {chapter_id: number | null; year: number; count: number}[];
  };
  computed_at: string;
  chapters: {id: number; label: string}[];
  shared_commitments: {id: number; label: string}[];
  shares_without_lines: {year: number; amount: number}[];
  // Stanziamento dei capitoli (assestato, altrimenti iniziale; null = non caricato).
  budgets: {chapter_id: number; year: number; budget: number | null}[];
  // Utenze attive sui capitoli fuori da ogni convenzione calcolata.
  chapter_other_utilities: {chapter_id: number; count: number}[];
  // Fabbisogno annuo dei capitoli con tutte le convenzioni attive su di essi:
  // ogni utenza una volta sola, nella convenzione che continua.
  chapter_needs: ChapterNeed[];
  // Nomi delle altre convenzioni in chapter_needs.
  agreements: {id: number; label: string}[];
}

export interface ChapterNeed {
  chapter_id: number | null;
  year: number;
  utilities: number;
  billed: number;
  expected: number;
  // Quota delle utenze di questa convenzione.
  own_utilities: number;
  own: number;
  agreements: number[];
}
