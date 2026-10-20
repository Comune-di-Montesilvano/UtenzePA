import { HEADER_ROOT, LINES_PATH, parseInvoiceTree, walkLeaves, type XmlNode } from './xml-tree';

// Campi XML di una fattura da proporre nelle select dell'editor dei pattern,
// ordinati per plausibilità rispetto al campo di UtenzePA da valorizzare.

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
  | 'estimated'
  | ReadingTarget;
export type TargetField = HeaderTarget | LineTarget;

// Letture del contatore (in alternativa al consumo del periodo): fino a 6 per
// riga, ciascuna con data, valore e tipo (rilevata / stimata).
export const READING_SLOTS = 6;
type ReadingPart = 'Date' | 'Value' | 'Type';
export type ReadingTarget = `reading${1 | 2 | 3 | 4 | 5 | 6}${ReadingPart}`;
export const readingTarget = (slot: number, part: ReadingPart) =>
  `reading${slot}${part}` as ReadingTarget;
export const READING_TARGETS: ReadingTarget[] = Array.from({ length: READING_SLOTS }, (_, i) =>
  (['Date', 'Value', 'Type'] as ReadingPart[]).map((p) => readingTarget(i + 1, p)),
).flat();

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
  ...READING_TARGETS,
];

const CONDITION_CHILD = 'TipoDato';
const COMMITTENTE = 'CessionarioCommittente';

export function fieldKey(scope: FieldScope, path: string, where?: FieldCondition): string {
  return `${scope}|${path}|${where ? `${where.path}=${where.equals}` : ''}`;
}

function label(path: string, where?: FieldCondition): string {
  const segments = path.split('/');
  if (where) {
    const group = where.path.split('/').length - 2;
    segments[group] = `${segments[group]} (${CONDITION_CHILD} = ${where.equals})`;
  }
  return segments.join(' › ');
}

export function buildCatalog(xml: Buffer): CatalogField[] {
  const tree = parseInvoiceTree(xml);
  const fields = new Map<string, CatalogField>();

  const add = (scope: FieldScope, path: string, value: string, where?: FieldCondition) => {
    const key = fieldKey(scope, path, where);
    const existing = fields.get(key);
    if (!existing) {
      fields.set(key, {
        key,
        scope,
        label: label(path, where),
        path,
        where,
        sample: value || null,
      });
    } else if (!existing.sample && value) {
      existing.sample = value;
    }
  };

  const collect = (
    scope: FieldScope,
    node: XmlNode,
    prefix: string,
    skip?: (p: string) => boolean,
  ) =>
    walkLeaves(
      node,
      prefix,
      (path, value, parent, parentPath) => {
        add(scope, path, value);
        // Gruppo con TipoDato (es. AltriDatiGestionali): variante per ogni tipo.
        const kind = parent[CONDITION_CHILD]?.find(
          (v): v is string => typeof v === 'string',
        )?.trim();
        const child = path.slice(parentPath ? parentPath.length + 1 : 0);
        if (kind && child !== CONDITION_CHILD) {
          const conditionPath = parentPath ? `${parentPath}/${CONDITION_CHILD}` : CONDITION_CHILD;
          add(scope, path, value, { path: conditionPath, equals: kind });
        }
      },
      skip,
    );

  const header = tree.root[HEADER_ROOT]?.[0];
  if (header && typeof header === 'object') collect('header', header, HEADER_ROOT);
  if (tree.bodies[0]) {
    collect('header', tree.bodies[0], '', (p) => p === LINES_PATH || p === 'Allegati');
  }
  for (const line of tree.lines) collect('line', line, '');
  return [...fields.values()];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d+\.\d{2,8}$/;
const POD = /^IT\d{3}E\w{8}$/i;
const PDR = /^\d{14}$/;

const FORMATS: Record<TargetField, (v: string) => boolean> = {
  supplierVat: (v) => /^\d{11}$/.test(v),
  supplierName: (v) => /[A-Za-z]{3}/.test(v),
  number: (v) => v.length > 0,
  date: (v) => DATE.test(v),
  documentType: (v) => /^TD\d{2}$/.test(v),
  total: (v) => AMOUNT.test(v),
  netAmount: (v) => AMOUNT.test(v),
  cig: (v) => /^[A-Z0-9]{10}$/.test(v),
  contractRef: (v) => v.length > 0,
  utility: (v) => POD.test(v) || PDR.test(v) || /^\d{6,9}$/.test(v),
  periodStart: (v) => DATE.test(v),
  periodEnd: (v) => DATE.test(v),
  amount: (v) => AMOUNT.test(v),
  description: (v) => /[A-Za-z]{3}/.test(v),
  consumption: (v) => /^-?\d+([.,]\d+)?$/.test(v),
  consumptionF1: (v) => /^-?\d+([.,]\d+)?$/.test(v),
  consumptionF2: (v) => /^-?\d+([.,]\d+)?$/.test(v),
  consumptionF3: (v) => /^-?\d+([.,]\d+)?$/.test(v),
  unit: (v) => /^[A-Za-z0-9³]{1,6}$/.test(v),
  meter: (v) => v.length > 0,
  estimated: (v) => /stimat/i.test(v),
  ...(Object.fromEntries(
    READING_TARGETS.map((t) => [
      t,
      t.endsWith('Date')
        ? (v: string) => DATE.test(v)
        : t.endsWith('Value')
          ? (v: string) => /^\d+([.,]\d+)?$/.test(v)
          : (v: string) => /rilevat|stimat|effettiv|reale|presunt/i.test(v),
    ]),
  ) as Record<ReadingTarget, (v: string) => boolean>),
};

// Percorsi tipici del tracciato FatturaPA, a parità di formato.
const HINTS: Record<TargetField, string[]> = {
  supplierVat: ['CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice'],
  supplierName: ['CedentePrestatore/DatiAnagrafici/Anagrafica/Denominazione'],
  number: ['DatiGeneraliDocumento/Numero'],
  date: ['DatiGeneraliDocumento/Data'],
  documentType: ['DatiGeneraliDocumento/TipoDocumento'],
  total: ['DatiGeneraliDocumento/ImportoTotaleDocumento'],
  netAmount: ['DatiRiepilogo/ImponibileImporto'],
  cig: ['CodiceCIG'],
  contractRef: ['DatiContratto/IdDocumento'],
  utility: ['AltriDatiGestionali/RiferimentoTesto', 'DatiContratto/IdDocumento'],
  periodStart: ['DataInizioPeriodo'],
  periodEnd: ['DataFinePeriodo'],
  amount: ['PrezzoTotale'],
  description: ['Descrizione'],
  consumption: ['Quantita'],
  consumptionF1: [],
  consumptionF2: [],
  consumptionF3: [],
  unit: ['UnitaMisura'],
  meter: ['AltriDatiGestionali/RiferimentoTesto'],
  estimated: [],
  ...(Object.fromEntries(READING_TARGETS.map((t) => [t, []])) as Record<ReadingTarget, string[]>),
};

export function targetScope(target: TargetField): FieldScope {
  return (HEADER_TARGETS as string[]).includes(target) ? 'header' : 'line';
}

// Ordine: formato giusto, poi percorso tipico, poi campi della stessa sezione;
// i dati del Comune (CessionarioCommittente) sempre in fondo. I campi di riga
// possono venire anche dalla testata; quelli di testata mai dalle righe.
export function rankFor(target: TargetField, fields: CatalogField[]): CatalogField[] {
  const scope = targetScope(target);
  const format = FORMATS[target];
  const hints = HINTS[target];
  const score = (f: CatalogField): number[] => {
    const hint = hints.findIndex((h) => f.path === h || f.path.endsWith(`/${h}`));
    return [
      f.path.includes(COMMITTENTE) ? 1 : 0,
      format(f.sample ?? '') ? 0 : 1,
      hint < 0 ? hints.length : hint,
      f.where ? 0 : 1,
      f.scope === scope ? 0 : 1,
    ];
  };
  return fields
    .filter((f) => scope === 'line' || f.scope === 'header')
    .map((f, index) => ({ f, index, s: score(f) }))
    .sort((a, b) => {
      for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
      return a.index - b.index;
    })
    .map((x) => x.f);
}
