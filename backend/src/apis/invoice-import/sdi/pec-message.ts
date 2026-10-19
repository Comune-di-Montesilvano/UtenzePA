import { simpleParser, type Attachment } from 'mailparser';
import { extractP7m } from './p7m';
import { sdiFileKind, type SdiFileKind } from './sdi-files';

export interface SdiFile {
  kind: SdiFileKind;
  fileName: string;
  content: Buffer; // XML in chiaro: le .p7m sono già estratte
}

export interface PecMessage {
  messageId: string;
  date: Date | null;
  subject: string;
  files: SdiFile[];
}

// I file SDI stanno dentro la busta PEC (postacert.eml) e, per gli esiti
// spediti da questa casella, dentro la ricevuta di consegna che riporta il
// messaggio originale: si scende in ogni message/rfc822.
async function collect(attachments: Attachment[], files: SdiFile[]): Promise<void> {
  for (const att of attachments) {
    if (att.contentType === 'message/rfc822') {
      const inner = await simpleParser(att.content);
      await collect(inner.attachments, files);
      continue;
    }
    const fileName = att.filename ?? '';
    const kind = sdiFileKind(fileName);
    if (kind === 'OTHER' || files.some((f) => f.fileName === fileName)) continue;
    let content = att.content;
    if (/\.p7m$/i.test(fileName)) {
      try {
        content = extractP7m(content);
      } catch {
        continue; // busta illeggibile: il resto del messaggio vale comunque
      }
    }
    files.push({ kind, fileName, content });
  }
}

export async function parsePecMessage(raw: Buffer): Promise<PecMessage> {
  const parsed = await simpleParser(raw);
  const files: SdiFile[] = [];
  await collect(parsed.attachments, files);
  return {
    messageId: parsed.messageId ?? '',
    date: parsed.date ?? null,
    subject: parsed.subject ?? '',
    files,
  };
}
