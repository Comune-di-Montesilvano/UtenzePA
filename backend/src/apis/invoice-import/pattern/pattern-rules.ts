import { createHash } from 'crypto';
import type { FieldCondition, FieldScope, HeaderTarget, LineTarget } from './field-catalog';
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

// Regole di un pattern: per ogni campo di UtenzePA da dove prenderlo nell'XML.
// Solo XML, mai il PDF. I campi di riga leggono la riga (DettaglioLinee) salvo
// fromHeader / numberAfter con fromHeader, che leggono la testata.
export type Rule =
  | { kind: 'field'; path: string; where?: FieldCondition }
  | { kind: 'numberAfter'; path: string; word: string; fromHeader?: boolean }
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

// Primo numero dopo la parola; virgola decimale e migliaia col punto all'italiana.
export function numberAfter(text: string | null, word: string): number | null {
  if (!text || !word) return null;
  const at = text.toLowerCase().indexOf(word.toLowerCase());
  if (at < 0) return null;
  const match = /-?\d+(?:[.,]\d+)*/.exec(text.slice(at + word.length));
  if (!match) return null;
  let raw = match[0];
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value: string | null): number | null {
  if (value === null || value === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Somma dei valori del campo in testata (imponibile con più DatiRiepilogo).
function headerSum(tree: InvoiceTree, rule: Rule | undefined): number | null {
  if (!rule || (rule.kind !== 'field' && rule.kind !== 'fromHeader') || rule.where)
    return toNumber(headerRule(tree, rule));
  const scope = headerScope(tree, rule.path);
  const values = leafValues(scope.nodes, scope.path)
    .map(toNumber)
    .filter((n): n is number => n !== null);
  return values.length ? round2(values.reduce((sum, n) => sum + n, 0)) : null;
}

function headerRule(tree: InvoiceTree, rule: Rule | undefined, fallback?: string): string | null {
  if (!rule) return fallback ? headerValue(tree, fallback) : null;
  switch (rule.kind) {
    case 'field':
    case 'fromHeader':
      return headerValue(tree, rule.path, rule.where);
    case 'numberAfter': {
      const n = numberAfter(headerValue(tree, rule.path), rule.word);
      return n === null ? null : String(n);
    }
    default:
      return null;
  }
}

function lineRule(tree: InvoiceTree, line: XmlValue, rule: Rule | undefined): string | null {
  if (!rule) return null;
  switch (rule.kind) {
    case 'field':
      return firstValue([line], rule.path, rule.where);
    case 'fromHeader':
      return headerValue(tree, rule.path, rule.where);
    case 'numberAfter': {
      const text = rule.fromHeader ? headerValue(tree, rule.path) : firstValue([line], rule.path);
      const n = numberAfter(text, rule.word);
      return n === null ? null : String(n);
    }
    case 'grossAmount': {
      const net = toNumber(firstValue([line], 'PrezzoTotale')) ?? 0;
      const vat = toNumber(firstValue([line], 'AliquotaIVA')) ?? 0;
      return String(round2(net * (1 + vat / 100)));
    }
    default:
      return null;
  }
}

const readsHeader = (rule: Rule | undefined) =>
  rule?.kind === 'fromHeader' || (rule?.kind === 'numberAfter' && rule.fromHeader === true);

export function extract(xml: Buffer, rules: PatternRules): ExtractedInvoice {
  const tree = parseInvoiceTree(xml);
  const h = rules.header;
  const documentType = headerRule(tree, h.documentType, DEFAULTS.documentType) ?? '';
  const creditNote = CREDIT_NOTES.includes(documentType);

  const filter = rules.consumptionLineFilter?.trim().toLowerCase();
  // Consumo letto dalla testata: una volta sola, sulla prima riga ammessa.
  let headerConsumptionUsed = false;
  const lines = tree.lines.map((line): ExtractedLine => {
    const description = lineRule(tree, line, rules.line.description);
    const amountRule = rules.line.amount ?? { kind: 'grossAmount' };
    let consumption: number | null = null;
    const descriptionText = description ?? firstValue([line], 'Descrizione') ?? '';
    // Una nota di credito non registra consumi (i conguagli sono un caso a parte).
    if (!creditNote && (!filter || descriptionText.toLowerCase().includes(filter))) {
      if (!readsHeader(rules.line.consumption) || !headerConsumptionUsed) {
        consumption = toNumber(lineRule(tree, line, rules.line.consumption));
        if (consumption !== null && readsHeader(rules.line.consumption))
          headerConsumptionUsed = true;
      }
    }
    return {
      utility: lineRule(tree, line, rules.line.utility),
      periodStart: lineRule(tree, line, rules.line.periodStart),
      periodEnd: lineRule(tree, line, rules.line.periodEnd),
      amount: toNumber(lineRule(tree, line, amountRule)) ?? 0,
      description,
      consumption,
      unit: lineRule(tree, line, rules.line.unit),
      meter: lineRule(tree, line, rules.line.meter),
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
    date: headerRule(tree, h.date, DEFAULTS.date) ?? '',
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
    if (rule && 'path' in rule)
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
    } else if (rule.kind === 'numberAfter') {
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
