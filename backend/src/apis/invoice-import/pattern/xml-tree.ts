import { XMLParser } from 'fast-xml-parser';

// Albero della fattura con ogni elemento in un array: i gruppi ripetuti
// (righe, AltriDatiGestionali, DatiRiepilogo…) si leggono tutti allo stesso modo.
export type XmlValue = string | XmlNode;
export interface XmlNode {
  [key: string]: XmlValue[];
}

export const LINES_PATH = 'DatiBeniServizi/DettaglioLinee';
export const HEADER_ROOT = 'FatturaElettronicaHeader';

// Valori sempre stringa: P.IVA, POD e numeri fattura possono avere zeri iniziali.
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreAttributes: true,
  isArray: () => true,
});

export interface InvoiceTree {
  root: XmlNode;
  bodies: XmlNode[];
  lines: XmlNode[];
}

export function parseInvoiceTree(xml: Buffer): InvoiceTree {
  // Alcuni fornitori mettono BOM e <?xml-stylesheet?> prima dell'elemento radice.
  const parsed = parser.parse(xml.toString('utf8').replace(/^﻿/, '')) as XmlNode;
  const key = Object.keys(parsed).find((k) => !k.startsWith('?'));
  const root = (key ? parsed[key][0] : {}) as XmlNode;
  const bodies = (root.FatturaElettronicaBody ?? []).filter(isNode);
  const lines = bodies.length ? resolve([bodies[0]], LINES_PATH).filter(isNode) : [];
  return { root, bodies, lines };
}

export function isNode(value: XmlValue): value is XmlNode {
  return typeof value === 'object' && value !== null;
}

export function resolve(nodes: XmlValue[], path: string): XmlValue[] {
  if (!path) return nodes;
  return path
    .split('/')
    .reduce<XmlValue[]>((cur, key) => cur.flatMap((n) => (isNode(n) ? (n[key] ?? []) : [])), nodes);
}

export function leafValues(nodes: XmlValue[], path: string): string[] {
  return resolve(nodes, path)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim());
}

// Percorso di testata: dall'header se inizia con FatturaElettronicaHeader, altrimenti dal primo body.
export function headerScope(tree: InvoiceTree, path: string): { nodes: XmlValue[]; path: string } {
  if (path === HEADER_ROOT || path.startsWith(`${HEADER_ROOT}/`))
    return { nodes: [tree.root], path };
  return { nodes: tree.bodies.slice(0, 1), path };
}

// Visita ogni foglia: percorso senza indici, valore e nodo padre.
export function walkLeaves(
  node: XmlNode,
  prefix: string,
  visit: (path: string, value: string, parent: XmlNode, parentPath: string) => void,
  skip: (path: string) => boolean = () => false,
): void {
  for (const [key, values] of Object.entries(node)) {
    const path = prefix ? `${prefix}/${key}` : key;
    if (skip(path)) continue;
    for (const value of values) {
      if (isNode(value)) walkLeaves(value, path, visit, skip);
      else visit(path, value.trim(), node, prefix);
    }
  }
}
