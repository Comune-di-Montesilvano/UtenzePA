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
  | 'unit'
  | 'meter';
export type TargetField = HeaderTarget | LineTarget;

export type Rule =
  | {kind: 'field'; path: string; where?: FieldCondition}
  | {kind: 'numberAfter'; path: string; word: string; fromHeader?: boolean}
  | {kind: 'textAfter'; path: string; word: string; fromHeader?: boolean}
  | {kind: 'grossAmount'}
  | {kind: 'fromHeader'; path: string; where?: FieldCondition}
  | {kind: 'none'};

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
  };
  xml: string;
  catalog: CatalogField[];
  ranked: Record<TargetField, string[]>;
  similar: number[];
}

// Fatture del fornitore senza pattern: l'esempio è della variante più frequente.
export interface UnknownStructure {
  supplier_id: number;
  supplier: string;
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
  if (rule.kind === 'numberAfter' || rule.kind === 'textAfter') {
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
  'unit',
  'meter',
];

export const isHeaderTarget = (t: TargetField): t is HeaderTarget => (HEADER_TARGETS as string[]).includes(t);
