// Gemello di backend/src/apis/attachments/enum/attachment-entity-type.enum.ts.
export type AttachmentEntityType = 'asset' | 'plant' | 'plant_inspection' | 'utilizer_grant' | 'contract' | 'act';

export interface Attachment {
  id: number;
  entity_type: AttachmentEntityType;
  entity_id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  create_date: string;
  created_by?: {firstName?: string | null; lastName?: string | null} | null;
  // Solo nell'elenco di un impianto: allegato di una sua verifica.
  inspection?: {id: number; kind: string} | null;
}

// Gemello di backend/src/apis/attachments/attachment-file-policy.ts (estensioni ammesse).
export const ALLOWED_EXTENSIONS = ['pdf', 'p7m', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'txt',
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'dwg', 'eml', 'msg'];

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('it-IT', {maximumFractionDigits: 0})} KB`;
  return `${(n / 1024 / 1024).toLocaleString('it-IT', {maximumFractionDigits: 1})} MB`;
}

// Gemello di isPreviewableMime nel backend: PDF e immagini che il browser
// sa mostrare (TIFF no, si scarica).
export const isPreviewable = (a: Attachment): boolean =>
  ['application/pdf', 'image/jpeg', 'image/png'].includes(a.mime_type);

// Limiti letti dal server (GET /attachments/limits).
export interface AttachmentLimits {
  max_size_mb: number;
  extensions: string[];
}
