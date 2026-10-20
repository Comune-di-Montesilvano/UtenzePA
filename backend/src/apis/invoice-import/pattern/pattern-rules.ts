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
  line: Partial<Record<LineTarget, Rule>>;
  // Consumo solo dalle righe la cui descrizione contiene la parola.
  consumptionLineFilter?: string;
}

export interface ExtractedLine {
  utility: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  description: string | null;
  consumption: number | null;
  unit: string | null;
  meter: string | null;
  // Consumo stimato dal fornitore (lettura stimata, «di cui stimati» > 0).
  estimated: boolean;
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
  [...Object.values(rules.header), ...Object.values(rules.line)].some(
    (r) => isWordRule(r) && r.path === PDF_PATH,
  );

type HeaderRuleTarget = keyof PatternRules['header'];
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
// parola valgono qualsiasi spazio o a capo («kWh Puoi pagare» trova «kWh\nPuoi pagare»).
function positions(text: string, word: string): Found[] {
  const words = word.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const re = new RegExp(
    words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'),
    'gi',
  );
  const out: Found[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ at: m.index, end: re.lastIndex });
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

// Data nel formato dell'XML (aaaa-mm-gg), anche da gg/mm/aaaa, gg.mm.aa, gg-mm-aaaa:
// le date passano sempre di qui, così un campo di testo scelto per intero (es. la
// Causale) dà una data valida o nessuna, mai un testo che il database rifiuta. Un
// testo con più date («01.09.2026-30.09.2026») dà la prima, o l'ultima con last
// (fine periodo); senza date nessun valore.
export function isoDate(value: string | null, last = false): string | null {
  if (!value) return null;
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
  return (last ? dates[dates.length - 1] : dates[0]) ?? null;
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

function readWord(rule: WordRule, text: string | null): string | null {
  const scoped = fromAnchor(text, rule.anchor);
  const nth = rule.occurrence;
  if (rule.kind === 'textAfter') return textAfter(scoped, rule.word, nth);
  if (rule.kind === 'textBefore') return textBefore(scoped, rule.word, nth);
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
      value: readWord({ ...rule, anchor: undefined, occurrence: i + 1 }, text),
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

function headerRule(tree: InvoiceDoc, rule: Rule | undefined, fallback?: string): string | null {
  if (!rule) return fallback ? headerValue(tree, fallback) : null;
  if (isWordRule(rule)) return readWord(rule, headerText(tree, rule.path));
  if (rule.kind === 'field' || rule.kind === 'fromHeader')
    return headerValue(tree, rule.path, rule.where);
  return null;
}

function lineRule(
  tree: InvoiceDoc,
  line: XmlValue,
  rule: Rule | undefined,
  utility: string | null = null,
): string | null {
  if (!rule) return null;
  if (isWordRule(rule)) return readWord(rule, wordText(tree, line, rule, utility));
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
  const documentType = headerRule(tree, h.documentType, DEFAULTS.documentType) ?? '';
  const creditNote = CREDIT_NOTES.includes(documentType);

  const filter = rules.consumptionLineFilter?.trim().toLowerCase();
  // Consumo letto dalla testata: una volta sola per utenza, sulla prima riga ammessa.
  const headerConsumptionUsed = new Set<string>();
  const consumptionRule = rules.line.consumption;
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
    let estimated = false;
    const descriptionText = description ?? firstValue([line], 'Descrizione') ?? '';
    // Una nota di credito non registra consumi (i conguagli sono un caso a parte).
    if (!creditNote && (!filter || descriptionText.toLowerCase().includes(filter))) {
      const used = utility ?? '';
      const header = readsHeader(consumptionRule);
      if (!header || (!headerConsumptionUsed.has(used) && (utility !== null || !anyUtility))) {
        consumption = toNumber(lineRule(tree, line, consumptionRule, segment));
        if (consumption !== null) {
          const rule = rules.line.estimated;
          estimated = isEstimated(rule, lineRule(tree, line, rule, segment));
        }
        if (consumption !== null && readsHeader(consumptionRule)) headerConsumptionUsed.add(used);
      }
    }
    // Consumo da una regola «parola» senza unità mappata: unità dal testo (wordUnit).
    const unit =
      rules.line.unit || !isWordRule(consumptionRule) || consumptionRule.kind === 'textAfter'
        ? lineRule(tree, line, rules.line.unit)
        : consumption === null
          ? null
          : wordUnit(consumptionRule, wordText(tree, line, consumptionRule, segment));
    return {
      utility,
      periodStart: isoDate(lineRule(tree, line, rules.line.periodStart, segment)),
      periodEnd: isoDate(lineRule(tree, line, rules.line.periodEnd, segment), true),
      amount: toNumber(lineRule(tree, line, amountRule)) ?? 0,
      description,
      consumption,
      unit,
      meter: lineRule(tree, line, rules.line.meter, segment),
      estimated,
    };
  });

  // Nota di credito: c'è chi scrive gli importi positivi e chi già negativi.
  // Il segno si decide sul documento (totale, altrimenti somma delle righe) e
  // vale per tutti gli importi: i segni tra le righe restano quelli dell'XML.
  const total = toNumber(headerRule(tree, h.total));
  const documentSign = total ?? lines.reduce((sum, l) => sum + l.amount, 0);
  const factor = creditNote && documentSign > 0 ? -1 : 1;
  const signed = (n: number | null) => (n === null || n === 0 ? n : n * factor);
  for (const l of lines) l.amount = signed(l.amount) ?? 0;

  return {
    supplierVat: headerValue(tree, DEFAULTS.supplierVat) ?? '',
    supplierName: headerRule(tree, h.supplierName, DEFAULTS.supplierName),
    number: headerRule(tree, h.number, DEFAULTS.number) ?? '',
    date: isoDate(headerRule(tree, h.date, DEFAULTS.date)) ?? '',
    documentType,
    total: signed(total),
    netAmount: signed(headerSum(tree, h.netAmount)),
    cig: headerRule(tree, h.cig),
    contractRef: headerRule(tree, h.contractRef),
    lines,
  };
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

export function pickPattern<T extends { id: number; rules: PatternRules; paths_count: number }>(
  xml: Buffer,
  patterns: T[],
): T | null {
  const matching = patterns
    .filter((p) => patternMatches(xml, p.rules))
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
