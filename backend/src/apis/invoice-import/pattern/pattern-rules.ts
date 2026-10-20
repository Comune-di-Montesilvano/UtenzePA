import { createHash } from 'crypto';
import {
  HEADER_TARGETS,
  type FieldCondition,
  type FieldScope,
  type HeaderTarget,
  type LineTarget,
  type TargetField,
} from './field-catalog';
import {
  headerScope,
  isNode,
  leafValues,
  parseInvoiceTree,
  resolve,
  walkLeaves,
  type InvoiceTree,
  type XmlValue,
} from './xml-tree';

// Regole di un pattern: per ogni campo di UtenzePA da dove prenderlo nell'XML
// o, per le regole «parola», nel testo del PDF allegato (path = PDF_PATH).
// I campi di riga leggono la riga (DettaglioLinee) salvo fromHeader e le regole
// «parola» con fromHeader, che leggono la testata (o il PDF).
// numberAfter: primo numero dopo la parola; numberBefore: numero subito prima
// (es. «594 mc»); textAfter: prima parola dopo (matricola); textBefore: ultima
// parola prima; contains: la parola c'è (consumo stimato, es. «Stimata»). Le date
// lette così (gg/mm/aaaa) diventano aaaa-mm-gg come nell'XML. anchor: la ricerca parte da lì (es.
// «Sintesi consumi fatturati»); occurrence: quale volta della parola usare
// (1 = la prima), quando compare più volte; senza, la prima utile.
export type WordKind = 'numberAfter' | 'numberBefore' | 'textAfter' | 'textBefore' | 'contains';
export interface WordRule {
  kind: WordKind;
  path: string;
  word: string;
  fromHeader?: boolean;
  anchor?: string;
  occurrence?: number;
}

export type Rule =
  | { kind: 'field'; path: string; where?: FieldCondition }
  | WordRule
  | { kind: 'grossAmount' }
  | { kind: 'fromHeader'; path: string; where?: FieldCondition }
  | { kind: 'none' };

export interface PatternRules {
  header: Partial<Record<Exclude<HeaderTarget, 'supplierVat'>, Rule>>;
  line: Partial<Record<Exclude<LineTarget, 'readings'>, Rule>>;
  // Consumo solo dalle righe la cui descrizione contiene la parola.
  consumptionLineFilter?: string;
  // Letture del contatore dalla tabella del PDF, al posto del consumo del periodo.
  readingTable?: ReadingTable;
}

/**
 * Tabella delle letture nel testo del PDF, riconosciuta da UtenzePA (detectReadingTables)
 * e scelta nell'editor. Due versi:
 *   colonne (una lettura per colonna)      righe (una lettura per riga)
 *   UM   31/07/2026   31/08/2026           Data   Lettura   Tipo lettura
 *   rilevata   stimata                     29/06/2026   99369 mc   Stimata
 *   Smc   5.782   5.790                    07/08/2026   99963 mc   Stimata
 * label: testo prima delle date (colonne) o riga di intestazione (righe);
 * occurrence: quale tabella con la stessa intestazione (1 = la prima).
 */
export interface ReadingTable {
  layout: 'columns' | 'rows';
  label: string;
  occurrence?: number;
}

// Tabella trovata nel testo, con le letture lette (anteprima e selettore dell'editor).
export interface DetectedReadingTable extends ReadingTable {
  occurrence: number;
  cells: ReadingCells;
}

// Colonne lette dalla tabella delle letture, anche incomplete (per l'anteprima).
export interface ReadingCells {
  dates: string[];
  values: number[];
  types: string[];
  // Totalizzatori di fascia per lettura (tabelle con F1/F2/F3 nelle righe): il valore è la somma.
  bands?: (ReadingBands | null)[];
  // Unità letta nella tabella (kWh, kvarh, Smc…): distingue tabelle con la stessa intestazione.
  unit?: string;
}

export interface ReadingBands {
  f1?: number;
  f2?: number;
  f3?: number;
}

// Consumo per fascia oraria (energia elettrica), nello storico consumption_f1..f3.
export const BAND_TARGETS: LineTarget[] = ['consumptionF1', 'consumptionF2', 'consumptionF3'];

// Lettura del contatore letta in fattura: diventa una rilevazione a data.
export interface ExtractedReading {
  date: string;
  value: number;
  estimated: boolean;
  bands?: ReadingBands;
}

// Tipo di lettura stimato («Stimata», «presunta»); il resto (rilevata, effettiva) è reale.
export const isEstimatedReading = (type: string | null | undefined): boolean =>
  !!type && /stim|presun/i.test(type);

export interface ExtractedLine {
  utility: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  description: string | null;
  consumption: number | null;
  consumptionF1: number | null;
  consumptionF2: number | null;
  consumptionF3: number | null;
  unit: string | null;
  meter: string | null;
  // Consumo stimato dal fornitore (lettura stimata, «di cui stimati» > 0).
  estimated: boolean;
  // Letture complete (data e valore), nell'ordine delle colonne.
  readings: ExtractedReading[];
  // Tabella delle letture com'è stata letta (null = non trovata o non mappata).
  readingCells: ReadingCells | null;
}

export interface ExtractedInvoice {
  supplierVat: string;
  supplierName: string | null;
  number: string;
  date: string;
  documentType: string;
  total: number | null;
  netAmount: number | null;
  cig: string | null;
  contractRef: string | null;
  lines: ExtractedLine[];
  // Nota di credito o totale negativo: consumi e letture non si leggono.
  noConsumption?: boolean;
}

// Campi obbligatori del tracciato: valgono anche senza regola.
const DEFAULTS: Partial<Record<HeaderTarget, string>> = {
  supplierVat: 'FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice',
  supplierName:
    'FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/Anagrafica/Denominazione',
  number: 'DatiGenerali/DatiGeneraliDocumento/Numero',
  date: 'DatiGenerali/DatiGeneraliDocumento/Data',
  documentType: 'DatiGenerali/DatiGeneraliDocumento/TipoDocumento',
};

const TOTAL_PATH = 'DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento';

// Testo del PDF allegato: letto a parte (sdi/pdf-text.ts), solo per le regole «parola».
export const PDF_PATH = '@pdf';
export const WORD_KINDS: WordKind[] = [
  'numberAfter',
  'numberBefore',
  'textAfter',
  'textBefore',
  'contains',
];

export const isWordRule = (rule: Rule | undefined): rule is WordRule =>
  !!rule && (WORD_KINDS as string[]).includes(rule.kind);

// Le regole leggono il PDF: va estratto prima di extract().
export const usesPdf = (rules: PatternRules): boolean =>
  !!rules.readingTable ||
  [...Object.values(rules.header), ...Object.values(rules.line)].some(
    (r) => isWordRule(r) && r.path === PDF_PATH,
  );

type HeaderRuleTarget = keyof PatternRules['header'];
const DATE_TARGETS: TargetField[] = ['date', 'periodStart', 'periodEnd'];
const isHeaderField = (target: TargetField) => (HEADER_TARGETS as string[]).includes(target);

// utilities: codici delle utenze della fattura, per il tratto di testo di ciascuna.
type InvoiceDoc = InvoiceTree & { pdf: string | null; utilities: string[] };

// Note di credito (ordinaria e semplificata): in UtenzePA importi negativi.
const CREDIT_NOTES = ['TD04', 'TD08'];

const round2 = (n: number) => Math.round(n * 100) / 100;

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function relative(path: string, base: string): string {
  return base ? path.slice(base.length + 1) : path;
}

// Primo valore del campo; con la condizione, nel gruppo il cui TipoDato vale `equals`.
function firstValue(nodes: XmlValue[], path: string, where?: FieldCondition): string | null {
  if (!where) return leafValues(nodes, path).find((v) => v !== '') ?? null;
  const group = dirname(where.path);
  for (const node of resolve(nodes, group)) {
    if (!isNode(node)) continue;
    if (!leafValues([node], relative(where.path, group)).includes(where.equals)) continue;
    const value = leafValues([node], relative(path, group)).find((v) => v !== '');
    if (value !== undefined) return value;
  }
  return null;
}

function headerValue(tree: InvoiceTree, path: string, where?: FieldCondition): string | null {
  const scope = headerScope(tree, path);
  return firstValue(scope.nodes, scope.path, where);
}

// Virgola decimale e migliaia col punto all'italiana.
function italianNumber(raw: string): number | null {
  const plain = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.');
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

interface Found {
  at: number;
  end: number;
}

// Posizioni della parola nel testo, senza distinguere maiuscole; gli spazi della
// parola valgono qualsiasi spazio o a capo («kWh Puoi pagare» trova «kWh\nPuoi pagare»);
// «*» vale qualsiasi carattere dentro la parola, anche nessuno («rilevata *mc» trova
// «rilevata mc» e «rilevata Smc»); «|» separa parole alternative («rilevata|stimata»).
export function wordPattern(word: string): string {
  return word
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const alts = w
        .split('|')
        .filter(Boolean)
        .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '\\S*'));
      return alts.length > 1 ? `(?:${alts.join('|')})` : (alts[0] ?? '');
    })
    .filter(Boolean)
    .join('\\s+');
}

function positions(text: string, word: string): Found[] {
  const pattern = wordPattern(word);
  if (!pattern) return [];
  const re = new RegExp(pattern, 'gi');
  const out: Found[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    out.push({ at: m.index, end: re.lastIndex });
  }
  return out;
}

// Occorrenza scelta (1 = la prima); senza scelta la prima.
function nthPosition(text: string, word: string, nth?: number): Found | null {
  return positions(text, word)[(nth ?? 1) - 1] ?? null;
}

// Primo numero dopo la parola (o dopo la sua n-esima occorrenza).
export function numberAfter(text: string | null, word: string, nth?: number): number | null {
  if (!text || !word) return null;
  const found = nthPosition(text, word, nth);
  if (!found) return null;
  const match = /-?\d+(?:[.,]\d+)*/.exec(text.slice(found.end));
  return match ? italianNumber(match[0]) : null;
}

const NUMBER_BEFORE = /(?:^|[^\w.,-])(-?\d+(?:[.,]\d+)*)\s*$/;

// Numero subito prima della parola (solo spazi in mezzo). Senza occorrenza scelta,
// la prima che ne ha uno: «F1 (kWh)» si salta, «0,000 kWh» no.
export function numberBefore(text: string | null, word: string, nth?: number): number | null {
  if (!text || !word) return null;
  const all = positions(text, word);
  for (const { at } of nth ? all.slice(nth - 1, nth) : all) {
    const match = NUMBER_BEFORE.exec(text.slice(Math.max(0, at - 40), at));
    if (match) return italianNumber(match[1]);
  }
  return null;
}

// Prima parola dopo la parola cercata (es. matricola dopo «Contatore»), così com'è.
export function textAfter(text: string | null, word: string, nth?: number): string | null {
  if (!text || !word) return null;
  const found = nthPosition(text, word, nth);
  if (!found) return null;
  return /^[\s:.n°]*([^\s;,]+)/i.exec(text.slice(found.end))?.[1] ?? null;
}

// Ultima parola prima della parola cercata (es. matricola in «283767 Matricola»).
export function textBefore(text: string | null, word: string, nth?: number): string | null {
  if (!text || !word) return null;
  const found = nthPosition(text, word, nth);
  if (!found) return null;
  return /([^\s;,:]+)[\s:.]*$/.exec(text.slice(Math.max(0, found.at - 80), found.at))?.[1] ?? null;
}

// Date lette con «Dopo il testo»/«Prima del testo»: la prima data dopo il testo
// o l'ultima prima, saltando le parole in mezzo («29/06/2026 99369 mc Stimata
// 07/08/2026 … Consumo nel periodo»: prima di «Consumo nel periodo» = 07/08/2026).
const DATE_IN_TEXT = /\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?!\d)/g;
const DATE_WINDOW = 200;

export function dateAfter(text: string | null, word: string, nth?: number): string | null {
  if (!text || !word) return null;
  const found = nthPosition(text, word, nth);
  if (!found) return null;
  return text.slice(found.end, found.end + DATE_WINDOW).match(DATE_IN_TEXT)?.[0] ?? null;
}

export function dateBefore(text: string | null, word: string, nth?: number): string | null {
  if (!text || !word) return null;
  const found = nthPosition(text, word, nth);
  if (!found) return null;
  const dates = text.slice(Math.max(0, found.at - DATE_WINDOW), found.at).match(DATE_IN_TEXT);
  return dates?.[dates.length - 1] ?? null;
}

// Data nel formato dell'XML (aaaa-mm-gg), anche da gg/mm/aaaa, gg.mm.aa, gg-mm-aaaa:
// le date passano sempre di qui, così un campo di testo scelto per intero (es. la
// Causale) dà una data valida o nessuna, mai un testo che il database rifiuta. Un
// testo con più date («01.09.2026-30.09.2026») dà la prima, o l'ultima con last
// (fine periodo); senza date nessun valore.
export function isoDate(value: string | null, last = false): string | null {
  if (!value) return null;
  const dates = isoDates(value);
  return (last ? dates[dates.length - 1] : dates[0]) ?? null;
}

// Tutte le date del testo, in AAAA-MM-GG.
function isoDates(value: string): string[] {
  const re = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g;
  const dates: string[] = [];
  for (let m = re.exec(value); m; m = re.exec(value)) {
    if (m[1]) {
      dates.push(`${m[1]}-${m[2]}-${m[3]}`);
    } else {
      const year = m[6].length === 2 ? `20${m[6]}` : m[6];
      dates.push(`${year}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`);
    }
  }
  return dates;
}

// Righe della tabella cercate vicino alla riga delle date (prima o dopo).
const TABLE_REACH = 6;
const TYPE_WORD =
  /^(?:rilevat\w*|stimat\w*|effettiv\w*|real[ei]|presunt\w*|misurat\w*|autolettur\w*)$/i;
// Inizio di una riga della tabella: la data, anche dopo il tipo («Rilevata 30/06/2026 10.393», AGSM AIM).
const DATE_AT_START =
  /^\s*(?:(?:rilevat\w*|stimat\w*|effettiv\w*|real[ei]|presunt\w*|misurat\w*|autolettur\w*)\s+)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))(?!\d)/i;
const FIRST_DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?!\d)/;
// Fascia oraria nella riga («Fascia oraria F1»): F0 = totale del monorario.
const BAND_WORD = /\bF\s?([0-3])\b/i;
const UNIT_WORD = /(?:^|\s)(k?wh|kvarh|kw|s?mc|m3|mwh)(?=\s|$)/i;

/**
 * Letture di una riga della tabella: ogni data prende il numero e il tipo nello
 * stesso ordine («31.08.2026 30.09.2026 F1 120 Rilevata 180 Rilevata 60 kWh» =
 * iniziale 120 al 31/08, finale 180 al 30/09); la fascia non conta come numero.
 */
function rowReadings(
  line: string,
): { date: string; value: number; type: string; band: number | null }[] {
  const dates = line.match(new RegExp(FIRST_DATE.source, 'g')) ?? [];
  let rest = line.replace(new RegExp(FIRST_DATE.source, 'g'), ' ');
  const band = BAND_WORD.exec(rest);
  if (band) rest = rest.replace(BAND_WORD, ' ');
  const values = numbersOf(rest);
  const types = squash(rest)
    .split(' ')
    .filter((w) => TYPE_WORD.test(w));
  // Più date che numeri: un periodo col suo consumo («01/06/2026 - 30/06/2026 2»), non letture.
  if (values.length < dates.length) return [];
  const count = dates.length;
  return Array.from({ length: count }, (_, k) => ({
    date: isoDates(dates[k])[0],
    value: values[k],
    type: types[k] ?? types[0] ?? '',
    band: band ? Number(band[1]) : null,
  }));
}

// Letture delle righe, in ordine di data: con le fasce una lettura per data con i
// totalizzatori (valore = somma; stimata se lo è una fascia).
function rowsCells(rows: string[]): ReadingCells {
  const all = rows.flatMap(rowReadings).filter((r) => r.date);
  const cells: ReadingCells = { dates: [], values: [], types: [] };
  if (!all.some((r) => r.band !== null && r.band > 0)) {
    for (const r of all) {
      cells.dates.push(r.date);
      cells.values.push(r.value);
      cells.types.push(r.type);
    }
  } else {
    cells.bands = [];
    for (const date of [...new Set(all.map((r) => r.date))].sort()) {
      const same = all.filter((r) => r.date === date && r.band !== null && r.band > 0);
      const bands: ReadingBands = {};
      for (const r of same) bands[`f${r.band}` as keyof ReadingBands] = r.value;
      const sum = Object.values(bands).reduce<number>((s, v) => s + (v ?? 0), 0);
      cells.dates.push(date);
      cells.values.push(Math.round(sum * 1000) / 1000);
      cells.types.push(same.find((r) => isEstimatedReading(r.type))?.type ?? same[0]?.type ?? '');
      cells.bands.push(bands);
    }
  }
  if (cells.types.every((t) => !t)) cells.types = [];
  const unit = rows.map((r) => UNIT_WORD.exec(r)?.[1]).find(Boolean);
  if (unit) cells.unit = unit;
  return cells;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const numbersOf = (s: string) =>
  (s.match(/-?\d+(?:[.,]\d+)*/g) ?? []).map(italianNumber).filter((n): n is number => n !== null);
// Riga di soli tipi di lettura («rilevata   stimata»).
const isTypesLine = (s: string) => {
  const words = squash(s).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => TYPE_WORD.test(w));
};
// Testo prima del primo numero (o data): l'etichetta della riga, senza cifre.
const leadOf = (s: string, first: RegExp) => {
  const m = first.exec(s);
  return m ? squash(s.slice(0, m.index)) : null;
};

/**
 * Tabelle delle letture nel testo, nell'ordine in cui compaiono (vedi ReadingTable).
 * Colonne: una riga che inizia con un'etichetta senza cifre e poi solo date, e vicino
 * una riga con etichetta e tanti numeri quante le date (più, se c'è, una riga di tipi).
 * Righe: righe consecutive che iniziano con una data seguita da un numero, sotto
 * una riga di intestazione.
 */
export function detectReadingTables(text: string | null): DetectedReadingTable[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const found: { at: number; table: Omit<DetectedReadingTable, 'occurrence'> }[] = [];
  const near = (at: number, test: (l: string) => boolean): string | null => {
    for (let d = 1; d <= TABLE_REACH; d++) {
      for (const i of [at + d, at - d]) {
        if (i >= 0 && i < lines.length && test(lines[i])) return lines[i];
      }
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Colonne.
    const sq = squash(line);
    const dates = isoDates(sq);
    const label = leadOf(sq, FIRST_DATE);
    // Dopo l'etichetta solo date: «UM 31/07/2026 31/08/2026».
    const pureDates =
      !!label &&
      squash(sq.slice(label.length).replace(new RegExp(FIRST_DATE.source, 'g'), '')) === '';
    if (dates.length && label && !/\d/.test(label) && label.length <= 30 && pureDates) {
      // Riga dei valori: etichetta corta (l'unità, «Smc») e tanti numeri quante le date.
      const valueLine = near(i, (l) => {
        const lead = leadOf(l, /-?\d/);
        return (
          !!lead &&
          !/\d/.test(lead) &&
          lead.length <= 6 &&
          isoDates(l).length === 0 &&
          numbersOf(l).length === dates.length
        );
      });
      const typeLine = valueLine ? near(i, isTypesLine) : null;
      // Una sola data senza tipi è quasi sempre altro («Data emissione 25/09/2026 … 896»).
      if (valueLine && (dates.length > 1 || typeLine)) {
        found.push({
          at: i,
          table: {
            layout: 'columns',
            label,
            cells: {
              dates,
              values: numbersOf(valueLine),
              types: typeLine ? squash(typeLine).split(' ') : [],
              ...(UNIT_WORD.test(valueLine) ? { unit: UNIT_WORD.exec(valueLine)![1] } : {}),
            },
          },
        });
        continue;
      }
    }
    // Righe: inizio di una serie di righe data + numero.
    const isRow = (l: string) => {
      const m = DATE_AT_START.exec(l);
      return !!m && numbersOf(l.slice(m[0].length)).length > 0;
    };
    if (isRow(line) && !(i > 0 && isRow(lines[i - 1]))) {
      let h = i - 1;
      while (h >= 0 && !squash(lines[h])) h--;
      const header = h >= 0 ? squash(lines[h]) : '';
      // Intestazione con una data: è testo della bolletta (es. «accisa … dal 01/06/2026 al»
      // sopra uno scaglione «30/06/2026 da 0000000480»), e varrebbe per un solo mese.
      if (!header || header.length > 80 || FIRST_DATE.test(header)) continue;
      const rows: string[] = [];
      for (let j = i; j < lines.length && isRow(lines[j]); j++) rows.push(lines[j]);
      const cells = rowsCells(rows);
      if (cells.dates.length)
        found.push({ at: i, table: { layout: 'rows', label: header, cells } });
    }
  }
  const seen = new Map<string, number>();
  return found.map(({ table }) => {
    const key = `${table.layout}|${table.label.toLowerCase()}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { ...table, occurrence };
  });
}

// Letture della tabella scelta nel pattern (stesso verso, intestazione e occorrenza).
export function readingCells(text: string | null, table: ReadingTable): ReadingCells | null {
  const label = squash(table.label).toLowerCase();
  const match = detectReadingTables(text).find(
    (t) =>
      t.layout === table.layout &&
      t.label.toLowerCase() === label &&
      t.occurrence === (table.occurrence ?? 1),
  );
  return match?.cells ?? null;
}

// Testo dall'ancora in poi; senza ancora nel testo nessun dato (meglio di uno sbagliato).
export function fromAnchor(text: string | null, anchor: string | undefined): string | null {
  if (!text || !anchor?.trim()) return text;
  const found = nthPosition(text, anchor);
  return found ? text.slice(found.end) : null;
}

// Unità del consumo letto con una regola «parola»: la parola se è un'unità
// («kWh 542», «594 mc», anche «kWh Puoi pagare» prima del numero), altrimenti
// quella scritta dopo il numero («Consumi 2 Smc»).
const UNIT = /^[A-Za-z³]{1,5}$/;
function wordUnit(rule: WordRule, text: string | null): string | null {
  const words = rule.word.trim().split(/\s+/);
  if (rule.kind === 'numberBefore') return UNIT.test(words[0]) ? words[0] : null;
  if (words.length === 1 && UNIT.test(words[0])) return words[0];
  const scoped = fromAnchor(text, rule.anchor);
  if (!scoped) return null;
  const found = nthPosition(scoped, rule.word, rule.occurrence);
  if (!found) return null;
  const rest = scoped.slice(found.end);
  return /^\D*?-?\d+(?:[.,]\d+)*\s*([A-Za-z³]{1,5})(?![\w³])/.exec(rest)?.[1] ?? null;
}

// date: il campo è una data (data fattura, periodo), letta con dateAfter/dateBefore.
function readWord(rule: WordRule, text: string | null, date = false): string | null {
  const scoped = fromAnchor(text, rule.anchor);
  const nth = rule.occurrence;
  if (rule.kind === 'textAfter' || rule.kind === 'textBefore') {
    const after = rule.kind === 'textAfter';
    const token = (after ? textAfter : textBefore)(scoped, rule.word, nth);
    // Data: la parola accanto se ne contiene (anche due, «01.09.2026-30.09.2026»),
    // altrimenti la data più vicina saltando le parole in mezzo.
    if (!date || (token && isoDate(token))) return token;
    return (after ? dateAfter : dateBefore)(scoped, rule.word, nth);
  }
  if (rule.kind === 'contains')
    return scoped && positions(scoped, rule.word).length ? rule.word : null;
  const n =
    rule.kind === 'numberAfter'
      ? numberAfter(scoped, rule.word, nth)
      : numberBefore(scoped, rule.word, nth);
  return n === null ? null : String(n);
}

export interface WordOccurrence {
  n: number;
  context: string;
  value: string | null;
}

// Occorrenze della parola nel testo letto dalla regola (prima riga con utenza),
// col valore che darebbe ciascuna: l'editor le mostra per scegliere quella giusta.
export function wordOccurrences(
  xml: Buffer,
  rules: PatternRules,
  target: TargetField,
  pdf: string | null = null,
): WordOccurrence[] {
  const header = isHeaderField(target);
  const rule = header ? rules.header[target as HeaderRuleTarget] : rules.line[target as LineTarget];
  if (!isWordRule(rule) || rule.kind === 'contains') return [];
  const tree: InvoiceDoc = Object.assign(parseInvoiceTree(xml), { pdf, utilities: [] });
  let source: string | null;
  if (header) {
    source = headerText(tree, rule.path);
  } else {
    const utilities = tree.lines.map((line) => lineRule(tree, line, rules.line.utility));
    tree.utilities = [...new Set(utilities.filter((u): u is string => u !== null))];
    const index = Math.max(
      0,
      utilities.findIndex((u) => u !== null),
    );
    const line = tree.lines[index];
    if (!line) return [];
    const segment = tree.utilities.length > 1 && target !== 'utility' ? utilities[index] : null;
    source = wordText(tree, line, rule, segment);
  }
  const text = fromAnchor(source, rule.anchor);
  if (!text) return [];
  return positions(text, rule.word)
    .slice(0, 30)
    .map(({ at, end }, i) => ({
      n: i + 1,
      context: text
        .slice(Math.max(0, at - 50), end + 50)
        .replace(/\s+/g, ' ')
        .trim(),
      value: readWord(
        { ...rule, anchor: undefined, occurrence: i + 1 },
        text,
        DATE_TARGETS.includes(target),
      ),
    }));
}

// Testo della testata: i campi ripetuti (Causale, max 200 caratteri l'uno) si
// uniscono senza separatore perché il fornitore li spezza anche a metà parola.
function headerText(tree: InvoiceDoc, path: string): string | null {
  if (path === PDF_PATH) return tree.pdf;
  const scope = headerScope(tree, path);
  const values = leafValues(scope.nodes, scope.path);
  return values.length ? values.join('') : null;
}

// Testo con più utenze: si legge dal punto in cui compare quella della riga
// fino alla prima delle altre.
function segmentFor(text: string | null, utility: string | null, all: string[]): string | null {
  if (!text || !utility) return text;
  const lower = text.toLowerCase();
  const at = lower.indexOf(utility.toLowerCase());
  if (at < 0) return text;
  const start = at + utility.length;
  const ends = all
    .filter((u) => u !== utility)
    .map((u) => lower.indexOf(u.toLowerCase(), start))
    .filter((i) => i >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// Consumo stimato: «di cui stimati» maggiore di zero, oppure la parola presente.
function isEstimated(rule: Rule | undefined, value: string | null): boolean {
  if (!isWordRule(rule) || value === null) return false;
  return rule.kind === 'contains' || (toNumber(value) ?? 0) > 0;
}

function toNumber(value: string | null): number | null {
  if (value === null || value === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Somma dei valori del campo in testata (imponibile con più DatiRiepilogo).
function headerSum(tree: InvoiceDoc, rule: Rule | undefined): number | null {
  if (!rule || (rule.kind !== 'field' && rule.kind !== 'fromHeader') || rule.where)
    return toNumber(headerRule(tree, rule));
  const scope = headerScope(tree, rule.path);
  const values = leafValues(scope.nodes, scope.path)
    .map(toNumber)
    .filter((n): n is number => n !== null);
  return values.length ? round2(values.reduce((sum, n) => sum + n, 0)) : null;
}

function headerRule(
  tree: InvoiceDoc,
  rule: Rule | undefined,
  fallback?: string,
  date = false,
): string | null {
  if (!rule) return fallback ? headerValue(tree, fallback) : null;
  if (isWordRule(rule)) return readWord(rule, headerText(tree, rule.path), date);
  if (rule.kind === 'field' || rule.kind === 'fromHeader')
    return headerValue(tree, rule.path, rule.where);
  return null;
}

function lineRule(
  tree: InvoiceDoc,
  line: XmlValue,
  rule: Rule | undefined,
  utility: string | null = null,
  date = false,
): string | null {
  if (!rule) return null;
  if (isWordRule(rule)) return readWord(rule, wordText(tree, line, rule, utility), date);
  switch (rule.kind) {
    case 'field':
      return firstValue([line], rule.path, rule.where);
    case 'fromHeader':
      return headerValue(tree, rule.path, rule.where);
    case 'grossAmount': {
      const net = toNumber(firstValue([line], 'PrezzoTotale')) ?? 0;
      const vat = toNumber(firstValue([line], 'AliquotaIVA')) ?? 0;
      return String(round2(net * (1 + vat / 100)));
    }
    default:
      return null;
  }
}

// Testo su cui cerca una regola «parola»: campo della riga, oppure testata o PDF
// dal punto in cui compare l'utenza della riga.
function wordText(
  tree: InvoiceDoc,
  line: XmlValue,
  rule: WordRule,
  utility: string | null,
): string | null {
  return rule.fromHeader
    ? segmentFor(headerText(tree, rule.path), utility, tree.utilities)
    : firstValue([line], rule.path);
}

const readsHeader = (rule: Rule | undefined) =>
  rule?.kind === 'fromHeader' || (isWordRule(rule) && rule.fromHeader === true);

// pdf: testo del PDF allegato, se le regole lo leggono (usesPdf).
export function extract(
  xml: Buffer,
  rules: PatternRules,
  pdf: string | null = null,
): ExtractedInvoice {
  const tree: InvoiceDoc = Object.assign(parseInvoiceTree(xml), { pdf, utilities: [] });
  const h = rules.header;
  // Tipo documento sempre dal tracciato: decide fattura o nota di credito, non si mappa.
  const documentType = headerValue(tree, DEFAULTS.documentType) ?? '';
  const creditNote = CREDIT_NOTES.includes(documentType);
  const total = toNumber(headerRule(tree, h.total));
  // Niente consumi da note di credito né da fatture col totale negativo (rettifiche
  // emesse come TD01 invece che TD04): gli importi restano come scritti.
  // Totale del tracciato, altrimenti quello mappato (anche se il pattern non lo legge).
  const documentTotal = toNumber(headerValue(tree, TOTAL_PATH)) ?? total;
  const noConsumption = creditNote || (documentTotal !== null && documentTotal < 0);

  const filter = rules.consumptionLineFilter?.trim().toLowerCase();
  // Consumo letto dalla testata: una volta sola per utenza, sulla prima riga ammessa.
  const headerConsumptionUsed = new Set<string>();
  const consumptionRule = rules.line.consumption;
  const bandRules = BAND_TARGETS.map((t) => rules.line[t]);
  const utilities = tree.lines.map((line) => lineRule(tree, line, rules.line.utility));
  // Con righe intestate a un'utenza, quelle senza (bollo, indennizzi) non prendono il consumo.
  const anyUtility = utilities.some((u) => u !== null);
  // Testo con più utenze (Causale, PDF): ogni riga legge dal punto della sua. Con
  // una sola utenza tutto il testo, che può citarla anche dopo il dato cercato.
  tree.utilities = [...new Set(utilities.filter((u): u is string => u !== null))];
  const segmented = tree.utilities.length > 1;
  const lines = tree.lines.map((line, index): ExtractedLine => {
    const utility = utilities[index];
    const segment = segmented ? utility : null;
    // Senza regola la Descrizione della riga (tracciato standard); «non presente» = nessuna.
    const description = rules.line.description
      ? lineRule(tree, line, rules.line.description)
      : firstValue([line], 'Descrizione');
    const amountRule = rules.line.amount ?? { kind: 'grossAmount' };
    let consumption: number | null = null;
    let bands: (number | null)[] = [null, null, null];
    let estimated = false;
    const descriptionText = description ?? firstValue([line], 'Descrizione') ?? '';
    // Una nota di credito non registra consumi (i conguagli sono un caso a parte).
    if (!noConsumption && (!filter || descriptionText.toLowerCase().includes(filter))) {
      const used = utility ?? '';
      const header = readsHeader(consumptionRule) || bandRules.some(readsHeader);
      if (!header || (!headerConsumptionUsed.has(used) && (utility !== null || !anyUtility))) {
        consumption = toNumber(lineRule(tree, line, consumptionRule, segment));
        bands = bandRules.map((r) => toNumber(lineRule(tree, line, r, segment)));
        // Fasce mappate ma non tutte trovate (monoraria, nota di credito…): solo il
        // consumo totale, nessuna fascia. Senza totale letto vale quanto trovato (es.
        // la sola F1 di una monoraria).
        const incomplete = bandRules.some((r, i) => r && bands[i] === null);
        if (incomplete) {
          const found = bands.filter((b): b is number => b !== null);
          if (found.length) {
            consumption ??= Math.round(found.reduce((sum, b) => sum + b, 0) * 1000) / 1000;
          }
          bands = [null, null, null];
        }
        // Senza totale letto il consumo è la somma delle fasce.
        if (consumption === null && bands.some((b) => b !== null)) {
          consumption =
            Math.round(bands.reduce((sum: number, b) => sum + (b ?? 0), 0) * 1000) / 1000;
        }
        if (consumption !== null) {
          const rule = rules.line.estimated;
          estimated = isEstimated(rule, lineRule(tree, line, rule, segment));
        }
        if (consumption !== null && header) headerConsumptionUsed.add(used);
      }
    }
    // Consumo da una regola «parola» senza unità mappata: unità dal testo (wordUnit),
    // dalla regola del totale o, per fasce, da quella della prima fascia.
    const unitRule = isWordRule(consumptionRule) ? consumptionRule : bandRules.find(isWordRule);
    const unit =
      rules.line.unit || !unitRule || unitRule.kind === 'textAfter'
        ? lineRule(tree, line, rules.line.unit)
        : consumption === null
          ? null
          : wordUnit(unitRule, wordText(tree, line, unitRule, segment));
    // Letture del contatore: come il consumo, niente da note di credito e righe senza utenza.
    let cells: ReadingCells | null = null;
    const readings: ExtractedReading[] = [];
    if (rules.readingTable && !noConsumption && (utility !== null || !anyUtility)) {
      cells = readingCells(segmentFor(tree.pdf, segment, tree.utilities), rules.readingTable);
      const columns = cells ? Math.min(cells.dates.length, cells.values.length) : 0;
      for (let i = 0; i < columns; i++) {
        const bands = cells!.bands?.[i];
        readings.push({
          date: cells!.dates[i],
          value: cells!.values[i],
          estimated: isEstimatedReading(cells!.types[i]),
          ...(bands ? { bands } : {}),
        });
      }
    }
    return {
      utility,
      periodStart: isoDate(lineRule(tree, line, rules.line.periodStart, segment, true)),
      periodEnd: isoDate(lineRule(tree, line, rules.line.periodEnd, segment, true), true),
      amount: toNumber(lineRule(tree, line, amountRule)) ?? 0,
      description,
      consumption,
      consumptionF1: bands[0],
      consumptionF2: bands[1],
      consumptionF3: bands[2],
      unit,
      meter: lineRule(tree, line, rules.line.meter, segment),
      estimated,
      readings,
      readingCells: cells,
    };
  });

  // Nota di credito: c'è chi scrive gli importi positivi e chi già negativi.
  // Il segno si decide sul documento (totale, altrimenti somma delle righe) e
  // vale per tutti gli importi: i segni tra le righe restano quelli dell'XML.
  const documentSign = total ?? lines.reduce((sum, l) => sum + l.amount, 0);
  const factor = creditNote && documentSign > 0 ? -1 : 1;
  const signed = (n: number | null) => (n === null || n === 0 ? n : n * factor);
  for (const l of lines) l.amount = signed(l.amount) ?? 0;

  return {
    supplierVat: headerValue(tree, DEFAULTS.supplierVat) ?? '',
    supplierName: headerRule(tree, h.supplierName, DEFAULTS.supplierName),
    number: headerRule(tree, h.number, DEFAULTS.number) ?? '',
    date: isoDate(headerRule(tree, h.date, DEFAULTS.date, true)) ?? '',
    documentType,
    total: signed(total),
    netAmount: signed(headerSum(tree, h.netAmount)),
    cig: headerRule(tree, h.cig),
    contractRef: headerRule(tree, h.contractRef),
    lines,
    noConsumption,
  };
}

// Nomi dei campi nella segnalazione dei dati dal PDF non trovati.
const PDF_FIELD_NAMES: Partial<Record<TargetField, string>> = {
  supplierName: 'ragione sociale',
  number: 'numero',
  date: 'data',
  total: 'totale',
  netAmount: 'imponibile',
  cig: 'CIG',
  contractRef: 'riferimento contratto',
  utility: 'utenza',
  periodStart: 'inizio periodo',
  periodEnd: 'fine periodo',
  amount: 'importo della riga',
  description: 'descrizione',
  consumption: 'consumo',
  consumptionF1: 'consumo F1',
  consumptionF2: 'consumo F2',
  consumptionF3: 'consumo F3',
  unit: 'unità di misura',
  meter: 'matricola',
  readings: 'letture del contatore',
};
const CONSUMPTION_FIELDS: TargetField[] = ['consumption', ...BAND_TARGETS, 'unit', 'readings'];

/**
 * Dati che il pattern legge dal PDF e che in questa fattura mancano (PDF assente o
 * con un layout diverso): testo della segnalazione, null se non manca nulla. Non
 * contano i dati che mancano per regola: consumi delle note di credito, fasce di
 * una monoraria (c'è il totale), unità senza consumo, stima (la parola può mancare).
 */
export function missingPdfData(
  rules: PatternRules,
  extracted: ExtractedInvoice,
  pdf: string | null,
): string | null {
  if (!usesPdf(rules)) return null;
  if (!pdf?.trim())
    return 'La fattura non ha un PDF leggibile: i dati dal PDF non sono stati letti.';
  const fromPdf = (rule: Rule | undefined) => isWordRule(rule) && rule.path === PDF_PATH;
  // Righe intestate a un'utenza (le altre, come il bollo, non hanno consumi).
  const withUtility = extracted.lines.filter((l) => l.utility !== null);
  const lines = withUtility.length ? withUtility : extracted.lines;
  const consumptionRead = lines.some((l) => l.consumption !== null);
  const missing: TargetField[] = [];
  for (const [t, rule] of Object.entries(rules.header) as [HeaderTarget, Rule][]) {
    const value = extracted[t as keyof ExtractedInvoice];
    if (fromPdf(rule) && (value === null || value === '')) missing.push(t);
  }
  for (const [t, rule] of Object.entries(rules.line) as [Exclude<LineTarget, 'readings'>, Rule][]) {
    if (!fromPdf(rule) || t === 'estimated') continue;
    if (CONSUMPTION_FIELDS.includes(t) && extracted.noConsumption) continue;
    if ((BAND_TARGETS as TargetField[]).includes(t) && consumptionRead) continue;
    if (t === 'unit' && !consumptionRead) continue;
    const scope = t === 'utility' ? extracted.lines : lines;
    if (scope.every((l) => l[t] === null || l[t] === '')) missing.push(t);
  }
  if (rules.readingTable && !extracted.noConsumption && !lines.some((l) => l.readings.length)) {
    missing.push('readings');
  }
  if (!missing.length) return null;
  const names = missing.map((t) => PDF_FIELD_NAMES[t] ?? t).join(', ');
  return `Dati dal PDF non trovati: ${names}. Il layout del PDF potrebbe essere cambiato: controlla il pattern.`.slice(
    0,
    500,
  );
}

interface Requirement {
  scope: FieldScope;
  path: string;
  where?: FieldCondition;
}

function requirements(rules: PatternRules): Requirement[] {
  const out: Requirement[] = [];
  for (const rule of Object.values(rules.header)) {
    // Il PDF non fa parte della struttura: una fattura senza PDF resta riconosciuta.
    if (rule && 'path' in rule && rule.path !== PDF_PATH)
      out.push({
        scope: 'header',
        path: rule.path,
        where: 'where' in rule ? rule.where : undefined,
      });
  }
  for (const rule of Object.values(rules.line)) {
    if (!rule) continue;
    if (rule.kind === 'grossAmount') {
      out.push({ scope: 'line', path: 'PrezzoTotale' }, { scope: 'line', path: 'AliquotaIVA' });
    } else if (rule.kind === 'field') {
      out.push({ scope: 'line', path: rule.path, where: rule.where });
    } else if (rule.kind === 'fromHeader') {
      out.push({ scope: 'header', path: rule.path, where: rule.where });
    } else if (isWordRule(rule) && rule.path !== PDF_PATH) {
      out.push({ scope: rule.fromHeader ? 'header' : 'line', path: rule.path });
    }
  }
  return out;
}

// Percorsi usati dalle regole (anche le condizioni): misura la specificità del pattern.
export function rulePaths(rules: PatternRules): string[] {
  const paths = new Set<string>();
  for (const r of requirements(rules)) {
    paths.add(`${r.scope}|${r.path}`);
    if (r.where) paths.add(`${r.scope}|${r.where.path}=${r.where.equals}`);
  }
  return [...paths];
}

// Ogni campo usato esiste nella fattura: in testata, o in almeno una riga.
export function patternMatches(xml: Buffer, rules: PatternRules): boolean {
  const tree = parseInvoiceTree(xml);
  return requirements(rules).every((r) =>
    r.scope === 'header'
      ? headerValue(tree, r.path, r.where) !== null
      : tree.lines.some((line) => firstValue([line], r.path, r.where) !== null),
  );
}

// TipoDocumento del tracciato (TD01, TD04…).
export function documentTypeOf(xml: Buffer): string | null {
  return headerValue(parseInvoiceTree(xml), DEFAULTS.documentType);
}

// Nota di credito (TD04, TD08) dal TipoDocumento del tracciato.
export function isCreditNote(xml: Buffer): boolean {
  return CREDIT_NOTES.includes(documentTypeOf(xml) ?? '');
}

export function isCreditNoteType(type: string | null | undefined): boolean {
  return CREDIT_NOTES.includes(type ?? '');
}

// Pattern separati per tipo documento: vale solo quello dello stesso TipoDocumento.
export function pickPattern<
  T extends { id: number; rules: PatternRules; paths_count: number; document_type: string },
>(xml: Buffer, patterns: T[]): T | null {
  const type = documentTypeOf(xml) ?? '';
  const matching = patterns
    .filter((p) => p.document_type === type && patternMatches(xml, p.rules))
    .sort((a, b) => b.paths_count - a.paths_count);
  if (!matching.length) return null;
  if (matching.length > 1 && matching[1].paths_count === matching[0].paths_count) return null;
  return matching[0];
}

// Firma della struttura: percorsi distinti delle foglie, senza valori né allegati.
export function structureKey(xml: Buffer): string {
  const tree = parseInvoiceTree(xml);
  const paths = new Set<string>();
  walkLeaves(
    tree.root,
    '',
    (path) => paths.add(path),
    (path) => path === 'FatturaElettronicaBody/Allegati',
  );
  return createHash('sha1')
    .update([...paths].sort().join('\n'))
    .digest('hex');
}
