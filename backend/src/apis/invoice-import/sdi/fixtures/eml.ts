// Costruttori di messaggi MIME per gli spec: buste PEC finte con allegati SDI.
import { readFileSync } from 'fs';
import { join } from 'path';

export const fixture = (name: string): Buffer => readFileSync(join(__dirname, name));

export const attachment = (boundary: string, name: string, content: Buffer): string =>
  `--${boundary}\r\nContent-Type: application/octet-stream; name="${name}"\r\n` +
  `Content-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
  `${content.toString('base64').replace(/.{76}/g, '$&\r\n')}\r\n`;

export const text = (boundary: string, body: string): string =>
  `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

export const mail = (headers: string, boundary: string, parts: string[]): string =>
  `${headers}MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
  `${parts.join('')}--${boundary}--\r\n`;

const embedded = (boundary: string, inner: string) =>
  `--${boundary}\r\nContent-Type: message/rfc822; name="postacert.eml"\r\n` +
  `Content-Disposition: inline; filename="postacert.eml"\r\n\r\n${inner}\r\n`;

export const envelope = (
  inner: string,
  subject: string,
  messageId = '<busta-1@pec.prova.it>',
  date = 'Fri, 10 Jul 2026 09:00:00 +0200',
): Buffer =>
  Buffer.from(
    mail(`Message-ID: ${messageId}\r\nDate: ${date}\r\nSubject: ${subject}\r\n`, 'ESTERNA', [
      text('ESTERNA', 'Messaggio di posta certificata'),
      embedded('ESTERNA', inner),
    ]),
  );

/** Busta PEC dello SDI con la fattura firmata e i metadati. */
export const invoiceEml = (messageId: string, date?: string): Buffer =>
  envelope(
    mail('Subject: Invio File 99000000001\r\n', 'INTERNA', [
      text('INTERNA', 'Invio file'),
      attachment('INTERNA', 'IT01234567897_a1B2c.xml.p7m', fixture('fattura-firmata.xml.p7m')),
      attachment('INTERNA', 'IT01234567897_a1B2c_MT_001.xml', fixture('mt.xml')),
    ]),
    'POSTA CERTIFICATA: Invio File 99000000001',
    messageId,
    date,
  );

/** Ricevuta di consegna di un esito/notifica con il file SDI annidato. */
export const notificationEml = (
  messageId: string,
  fileName: string,
  fixtureName: string,
  date?: string,
): Buffer =>
  envelope(
    mail('Subject: Notifica\r\n', 'INTERNA', [
      attachment('INTERNA', fileName, fixture(fixtureName)),
    ]),
    'CONSEGNA: notifica',
    messageId,
    date,
  );
