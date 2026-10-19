import { XMLParser } from 'fast-xml-parser';

// File dello SDI (specifiche tecniche FatturaPA): fattura e notifiche hanno
// nomi e tracciati fissi, uguali per tutti i fornitori.

export type SdiFileKind = 'INVOICE' | 'MT' | 'EC' | 'DT' | 'SE' | 'OTHER';

const INVOICE_NAME = /^IT[0-9A-Z]{11,16}_[0-9A-Z]{1,5}\.xml(\.p7m)?$/i;
const NOTIFICATION_NAME = /^IT[0-9A-Z]{11,16}_[0-9A-Z]{1,5}_([A-Z]{2})_\d{3}\.xml$/i;
const NOTIFICATION_KINDS = ['MT', 'EC', 'DT', 'SE'];

export function sdiFileKind(fileName: string): SdiFileKind {
  if (INVOICE_NAME.test(fileName)) return 'INVOICE';
  const kind = NOTIFICATION_NAME.exec(fileName)?.[1].toUpperCase();
  return kind && NOTIFICATION_KINDS.includes(kind) ? (kind as SdiFileKind) : 'OTHER';
}

// Valori sempre stringa: P.IVA e numeri fattura possono avere zeri iniziali.
const parser = new XMLParser({
  removeNSPrefix: true,
  parseTagValue: false,
  ignoreAttributes: true,
  isArray: (name) => name === 'FatturaElettronicaBody' || name === 'Allegati',
});

type XmlNode = Record<string, unknown>;

function at(node: unknown, path: string): unknown {
  return path.split('/').reduce<unknown>((cur, key) => (cur as XmlNode | undefined)?.[key], node);
}

function text(node: unknown, path: string): string {
  const value = at(node, path);
  return typeof value === 'string' ? value.trim() : '';
}

function root(xml: Buffer): XmlNode {
  // Alcuni fornitori mettono BOM e <?xml-stylesheet?> prima dell'elemento radice.
  const parsed = parser.parse(xml.toString('utf8').replace(/^\uFEFF/, '')) as XmlNode;
  const key = Object.keys(parsed).find((k) => !k.startsWith('?'));
  return (key ? parsed[key] : {}) as XmlNode;
}

export interface InvoiceHeader {
  supplierVat: string;
  supplierName: string;
  documents: { type: string; number: string; date: string; total: number | null }[];
}

export function parseInvoiceHeader(xml: Buffer): InvoiceHeader {
  const doc = root(xml);
  const supplier = at(doc, 'FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici');
  const name =
    text(supplier, 'Anagrafica/Denominazione') ||
    [text(supplier, 'Anagrafica/Cognome'), text(supplier, 'Anagrafica/Nome')]
      .filter(Boolean)
      .join(' ');
  const bodies = (doc.FatturaElettronicaBody as XmlNode[] | undefined) ?? [];
  return {
    supplierVat: text(supplier, 'IdFiscaleIVA/IdCodice'),
    supplierName: name,
    documents: bodies.map((body) => {
      const general = at(body, 'DatiGenerali/DatiGeneraliDocumento');
      const total = text(general, 'ImportoTotaleDocumento');
      return {
        type: text(general, 'TipoDocumento'),
        number: text(general, 'Numero'),
        date: text(general, 'Data'),
        total: total ? Number(total) : null,
      };
    }),
  };
}

export function parseNotification(xml: Buffer): {
  sdiIdentifier: string;
  outcome: 'EC01' | 'EC02' | null;
  invoiceFileName: string | null;
} {
  const doc = root(xml);
  const outcome = text(doc, 'Esito');
  return {
    sdiIdentifier: text(doc, 'IdentificativoSdI'),
    outcome: outcome === 'EC01' || outcome === 'EC02' ? outcome : null,
    // Solo i metadati (MT) riportano il nome del file fattura a cui si riferiscono.
    invoiceFileName:
      'TentativiInvio' in doc || 'Formato' in doc ? text(doc, 'NomeFile') || null : null,
  };
}

export function extractPdf(xml: Buffer): { name: string; data: Buffer } | null {
  const bodies = (root(xml).FatturaElettronicaBody as XmlNode[] | undefined) ?? [];
  for (const body of bodies) {
    for (const attachment of (body.Allegati as XmlNode[] | undefined) ?? []) {
      const name = text(attachment, 'NomeAttachment');
      const isPdf =
        text(attachment, 'FormatoAttachment').toUpperCase() === 'PDF' ||
        name.toLowerCase().endsWith('.pdf');
      const content = text(attachment, 'Attachment');
      if (isPdf && content) {
        return { name: name || 'fattura.pdf', data: Buffer.from(content, 'base64') };
      }
    }
  }
  return null;
}
