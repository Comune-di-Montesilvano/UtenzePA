import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// Tipi ammessi per gli allegati: estensione + firma del contenuto (il MIME del
// browser non conta, lo decide il server). Niente archivi né eseguibili; il
// p7m (firmato digitalmente) si conserva così com'è.
type Kind = 'pdf' | 'zip' | 'ole' | 'p7m' | 'jpeg' | 'png' | 'tiff' | 'text';

const TYPES: Record<string, { mime: string; kind: Kind }> = {
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  p7m: { mime: 'application/pkcs7-mime', kind: 'p7m' },
  doc: { mime: 'application/msword', kind: 'ole' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'ole' },
  msg: { mime: 'application/vnd.ms-outlook', kind: 'ole' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'zip',
  },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'zip' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', kind: 'zip' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'zip' },
  csv: { mime: 'text/csv', kind: 'text' },
  txt: { mime: 'text/plain', kind: 'text' },
  eml: { mime: 'message/rfc822', kind: 'text' },
  jpg: { mime: 'image/jpeg', kind: 'jpeg' },
  jpeg: { mime: 'image/jpeg', kind: 'jpeg' },
  png: { mime: 'image/png', kind: 'png' },
  tif: { mime: 'image/tiff', kind: 'tiff' },
  tiff: { mime: 'image/tiff', kind: 'tiff' },
};

export const ALLOWED_EXTENSIONS: readonly string[] = Object.keys(TYPES);

const startsWith = (head: Buffer, bytes: number[]) =>
  head.length >= bytes.length && bytes.every((b, i) => head[i] === b);

function matches(kind: Kind, head: Buffer): boolean {
  switch (kind) {
    case 'pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'zip':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
    case 'ole':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    // DER (SEQUENCE) oppure base64 di un DER.
    case 'p7m':
      return head[0] === 0x30 || head.subarray(0, 2).toString('latin1') === 'MI';
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
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

export function maxSizeBytes(): number {
  const mb = parseInt(process.env.ATTACHMENT_MAX_SIZE_MB ?? '50', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}
