import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// Tipi ammessi per gli allegati: estensione + firma del contenuto (il MIME del
// browser non conta, lo decide il server). Niente archivi né eseguibili; il
// p7m (firmato digitalmente) si conserva così com'è.
type Kind = 'pdf' | 'ooxml' | 'odf' | 'ole' | 'p7m' | 'jpeg' | 'png' | 'tiff' | 'dwg' | 'text';

const TYPES: Record<string, { mime: string; kind: Kind }> = {
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  p7m: { mime: 'application/pkcs7-mime', kind: 'p7m' },
  doc: { mime: 'application/msword', kind: 'ole' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'ole' },
  msg: { mime: 'application/vnd.ms-outlook', kind: 'ole' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'ooxml',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'ooxml',
  },
  odt: { mime: 'application/vnd.oasis.opendocument.text', kind: 'odf' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'odf' },
  csv: { mime: 'text/csv', kind: 'text' },
  txt: { mime: 'text/plain', kind: 'text' },
  eml: { mime: 'message/rfc822', kind: 'text' },
  jpg: { mime: 'image/jpeg', kind: 'jpeg' },
  jpeg: { mime: 'image/jpeg', kind: 'jpeg' },
  png: { mime: 'image/png', kind: 'png' },
  tif: { mime: 'image/tiff', kind: 'tiff' },
  tiff: { mime: 'image/tiff', kind: 'tiff' },
  // Disegni AutoCAD (planimetrie, schemi impianti).
  dwg: { mime: 'image/vnd.dwg', kind: 'dwg' },
};

export const ALLOWED_EXTENSIONS: readonly string[] = Object.keys(TYPES);

const startsWith = (head: Buffer, bytes: number[]) =>
  head.length >= bytes.length && bytes.every((b, i) => head[i] === b);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
// Un pacchetto Office (OOXML) ha tra i primi file [Content_Types].xml o le
// cartelle _rels/, docProps/, word/, xl/; un OpenDocument ha per primo il file
// «mimetype» non compresso. Uno ZIP qualsiasi rinominato non passa.
const OOXML_MARKERS = ['[Content_Types].xml', '_rels/', 'docProps/', 'word/', 'xl/'];
const ODF_MARKER = 'mimetypeapplication/vnd.oasis.opendocument';
// OID 1.2.840.113549.1.7.2 (PKCS#7 signedData) in DER.
const P7_SIGNED_DATA = Buffer.from([
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02,
]);
const BASE64 = /^[A-Za-z0-9+/=\r\n]+$/;

function matches(kind: Kind, head: Buffer): boolean {
  switch (kind) {
    case 'pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'ooxml': {
      const text = head.toString('latin1');
      return startsWith(head, ZIP) && OOXML_MARKERS.some((m) => text.includes(m));
    }
    case 'odf':
      return startsWith(head, ZIP) && head.toString('latin1').includes(ODF_MARKER);
    case 'ole':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    // DER (SEQUENCE con l'OID signedData) oppure base64 di un DER.
    case 'p7m': {
      if (head[0] === 0x30) return head.subarray(0, 64).includes(P7_SIGNED_DATA);
      // FatturaPA nominata .p7m ma non firmata: XML (con o senza BOM).
      // trimStart toglie anche il BOM (U+FEFF è spazio per JavaScript).
      if (head.subarray(0, 64).toString('utf8').trimStart().startsWith('<?xml')) return true;
      const start = head.subarray(0, 64).toString('latin1');
      return start.startsWith('MI') && BASE64.test(start);
    }
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
    // «AC» + versione a 4 caratteri (AC1018 = AutoCAD 2004, AC1032 = 2018).
    case 'dwg':
      return /^AC[0-9.]{4}$/.test(head.subarray(0, 6).toString('latin1'));
    case 'tiff':
      return (
        startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])
      );
    // Testo: nessun byte NUL nei primi 8 KB.
    case 'text':
      return !head.subarray(0, 8192).includes(0);
  }
}

export function extensionOf(name: string): string {
  const base = path.posix.basename(name.replace(/\\/g, '/'));
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function checkFile(originalName: string, head: Buffer): { ext: string; mime: string } {
  const ext = extensionOf(originalName);
  const type = TYPES[ext];
  if (!type) {
    throw new BadRequestException(
      `Tipo di file non ammesso${ext ? ` (.${ext})` : ''}. Ammessi: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    );
  }
  if (!matches(type.kind, head)) {
    throw new BadRequestException(`Il contenuto del file non corrisponde al tipo .${ext}`);
  }
  return { ext, mime: type.mime };
}

// Nome originale senza percorso; fallback ASCII per i client vecchi e
// filename* (RFC 5987) con il nome vero.
export function contentDisposition(originalName: string, inline: boolean): string {
  const base = path.posix.basename(originalName.replace(/\\/g, '/'));
  const ascii = base.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(base).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// PDF e immagini che il browser sa mostrare (TIFF no): solo questi in anteprima.
export function isPreviewableMime(mime: string): boolean {
  return ['application/pdf', 'image/jpeg', 'image/png'].includes(mime);
}

export function maxSizeBytes(): number {
  const mb = parseInt(process.env.ATTACHMENT_MAX_SIZE_MB ?? '50', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}
