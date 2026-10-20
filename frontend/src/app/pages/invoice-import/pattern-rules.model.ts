// Gemello dei tipi del backend (apis/invoice-import/pattern/pattern-rules.ts e field-catalog.ts).

export type FieldScope = 'header' | 'line';

export interface FieldCondition {
  path: string;
  equals: string;
}

export interface CatalogField {
  key: string;
  scope: FieldScope;
  label: string;
  path: string;
  where?: FieldCondition;
  sample: string | null;
}

export type HeaderTarget =
  | 'supplierVat'
  | 'supplierName'
  | 'number'
  | 'date'
  | 'documentType'
  | 'total'
  | 'netAmount'
  | 'cig'
  | 'contractRef';
export type LineTarget =
  | 'utility'
  | 'periodStart'
  | 'periodEnd'
  | 'amount'
  | 'description'
  | 'consumption'
  | 'consumptionF1'
  | 'consumptionF2'
  | 'consumptionF3'
  | 'unit'
  | 'meter'
  | 'estimated';
export type TargetField = HeaderTarget | LineTarget;

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
  | {kind: 'field'; path: string; where?: FieldCondition}
  | WordRule
  | {kind: 'grossAmount'}
  | {kind: 'fromHeader'; path: string; where?: FieldCondition}
  | {kind: 'none'};

// Percorso speciale: testo del PDF allegato (solo regole «parola»: consumo, matricola, stima).
export const PDF_PATH = '@pdf';
export const PDF_LABEL = 'Testo del PDF allegato';
export const WORD_KINDS: WordKind[] = ['numberAfter', 'numberBefore', 'textAfter', 'textBefore', 'contains'];
export const isWordRule = (rule: Rule): rule is WordRule => (WORD_KINDS as string[]).includes(rule.kind);

export interface PatternRules {
  header: Partial<Record<Exclude<HeaderTarget, 'supplierVat'>, Rule>>;
  line: Partial<Record<LineTarget, Rule>>;
  consumptionLineFilter?: string;
}

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

export interface PatternCheck {
  field: TargetField;
  tone: 'ok' | 'warn' | 'danger' | 'off';
  text: string;
}

export interface PatternPreview {
  matches: boolean;
  extracted: ExtractedInvoice | null;
  match: {existingInvoiceId: number | null; issues: {type: string; lineIndex: number | null; detail: string}[]} | null;
  checks: PatternCheck[];
  // Occorrenze della parola (consumo, matricola, stima) col valore di ciascuna.
  occurrences?: Partial<Record<string, WordOccurrence[]>>;
}

// Regole provate su un gruppo di fatture simili (POST /invoice-patterns/analyze).
export interface PatternAnalysis {
  analyzed: number;
  unavailable: number;
  matches: number;
  found: Partial<Record<string, number>>;
  // Fatture dove il campo mappato non ha valore, e quelle con struttura non riconosciuta.
  notFound: Partial<Record<string, number[]>>;
  unmatched: number[];
}

export interface WordOccurrence {
  n: number;
  context: string;
  value: string | null;
}

export interface PatternEditorData {
  message: {
    id: number;
    supplier_id: number;
    supplier: string;
    supplier_vat: string | null;
    file_name: string;
    document_number: string | null;
    document_date: string | null;
    status: string;
    pattern_id: number | null;
    document_type: string | null;
    credit_note: boolean;
  };
  xml: string;
  pdf_text: string | null;
  catalog: CatalogField[];
  ranked: Record<TargetField, string[]>;
  // Fatture del fornitore senza pattern, raggruppate per variante di struttura.
  similar: number[];
  // Varianti: posizione della prima fattura in similar e quante sono.
  variants: {start: number; count: number}[];
  // Numero documento di ciascuna fattura di similar (stesso indice).
  numbers: (string | null)[];
}

// Fatture del fornitore senza pattern: l'esempio è della variante più frequente.
export interface UnknownStructure {
  supplier_id: number;
  supplier: string;
  // TipoDocumento (TD01, TD02, TD04…): pattern separati per tipo; vuoto = non ancora letto.
  document_type: string;
  structure_key: string;
  count: number;
  structures: number;
  message_id: number;
}

export interface InvoicePatternRow {
  id: number;
  name: string;
  supplier_id: number;
  supplier: string;
  ignored: boolean;
  document_type: string;
  structure_key: string;
  update_date: string;
  extracted: number;
  sample_message_id: number | null;
}

export interface InvoicePattern {
  id: number;
  supplier_id_fk: number;
  name: string;
  ignored: boolean;
  rules: PatternRules | null;
  structure_key: string;
}

export function fieldKey(scope: FieldScope, path: string, where?: FieldCondition): string {
  return `${scope}|${path}|${where ? `${where.path}=${where.equals}` : ''}`;
}

// Chiave del campo del catalogo letto da una regola (null: regola senza campo).
export function ruleFieldKey(target: TargetField, rule: Rule): string | null {
  if (rule.kind === 'field') return fieldKey(isHeaderTarget(target) ? 'header' : 'line', rule.path, rule.where);
  if (rule.kind === 'fromHeader') return fieldKey('header', rule.path, rule.where);
  if (isWordRule(rule)) {
    return fieldKey(isHeaderTarget(target) || rule.fromHeader ? 'header' : 'line', rule.path);
  }
  return null;
}

export const HEADER_TARGETS: HeaderTarget[] = [
  'supplierVat',
  'supplierName',
  'number',
  'date',
  'documentType',
  'total',
  'netAmount',
  'cig',
  'contractRef',
];
export const LINE_TARGETS: LineTarget[] = [
  'utility',
  'periodStart',
  'periodEnd',
  'amount',
  'description',
  'consumption',
  'consumptionF1',
  'consumptionF2',
  'consumptionF3',
  'unit',
  'meter',
  'estimated',
];

// Consumo per fascia oraria: righe visibili solo con «Consumo: Per fasce».
export type BandTarget = 'consumptionF1' | 'consumptionF2' | 'consumptionF3';
export const BAND_TARGETS: BandTarget[] = ['consumptionF1', 'consumptionF2', 'consumptionF3'];

export const isHeaderTarget = (t: TargetField): t is HeaderTarget => (HEADER_TARGETS as string[]).includes(t);

// TipoDocumento della FatturaPA (specifiche SDI).
const DOCUMENT_TYPES: Record<string, string> = {
  TD01: 'Fattura',
  TD02: 'Acconto/anticipo su fattura',
  TD03: 'Acconto/anticipo su parcella',
  TD04: 'Nota di credito',
  TD05: 'Nota di debito',
  TD06: 'Parcella',
  TD07: 'Fattura semplificata',
  TD08: 'Nota di credito semplificata',
  TD09: 'Nota di debito semplificata',
  TD16: 'Integrazione fattura reverse charge interno',
  TD17: 'Integrazione/autofattura per acquisto servizi dall\'estero',
  TD18: 'Integrazione per acquisto di beni intracomunitari',
  TD19: 'Integrazione/autofattura per acquisto di beni ex art. 17 c. 2 DPR 633/72',
  TD20: 'Autofattura per regolarizzazione e integrazione delle fatture',
  TD21: 'Autofattura per splafonamento',
  TD22: 'Estrazione beni da Deposito IVA',
  TD23: 'Estrazione beni da Deposito IVA con versamento dell\'IVA',
  TD24: 'Fattura differita (art. 21, c. 4, lett. a)',
  TD25: 'Fattura differita (art. 21, c. 4, terzo periodo, lett. b)',
  TD26: 'Cessione di beni ammortizzabili e passaggi interni',
  TD27: 'Fattura per autoconsumo o cessioni gratuite senza rivalsa',
  TD28: 'Acquisti da San Marino con IVA',
};

// «TD02 · Acconto/anticipo su fattura»; vuoto = tipo non ancora letto dalla PEC.
export function documentTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Tipo da leggere';
  return DOCUMENT_TYPES[type] ? `${type} · ${DOCUMENT_TYPES[type]}` : type;
}
