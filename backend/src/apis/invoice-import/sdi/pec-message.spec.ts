import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePecMessage } from './pec-message';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name));

const attachment = (boundary: string, name: string, content: Buffer) =>
  `--${boundary}\r\nContent-Type: application/octet-stream; name="${name}"\r\n` +
  `Content-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
  `${content.toString('base64').replace(/.{76}/g, '$&\r\n')}\r\n`;

const text = (boundary: string, body: string) =>
  `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

const mail = (headers: string, boundary: string, parts: string[]) =>
  `${headers}MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n` +
  `${parts.join('')}--${boundary}--\r\n`;

const embedded = (boundary: string, inner: string) =>
  `--${boundary}\r\nContent-Type: message/rfc822; name="postacert.eml"\r\n` +
  `Content-Disposition: inline; filename="postacert.eml"\r\n\r\n${inner}\r\n`;

const envelope = (inner: string, subject: string) =>
  Buffer.from(
    mail(
      `Message-ID: <busta-1@pec.prova.it>\r\nDate: Fri, 10 Jul 2026 09:00:00 +0200\r\nSubject: ${subject}\r\n`,
      'ESTERNA',
      [text('ESTERNA', 'Messaggio di posta certificata'), embedded('ESTERNA', inner)],
    ),
  );

describe('parsePecMessage', () => {
  it('busta PEC con fattura p7m e metadati', async () => {
    const inner = mail('Subject: Invio File 99000000001\r\n', 'INTERNA', [
      text('INTERNA', 'Invio file'),
      attachment('INTERNA', 'IT01234567897_a1B2c.xml.p7m', fixture('fattura-firmata.xml.p7m')),
      attachment('INTERNA', 'IT01234567897_a1B2c_MT_001.xml', fixture('mt.xml')),
    ]);
    const msg = await parsePecMessage(envelope(inner, 'POSTA CERTIFICATA: Invio File 99000000001'));
    expect(msg.messageId).toBe('<busta-1@pec.prova.it>');
    expect(msg.subject).toBe('POSTA CERTIFICATA: Invio File 99000000001');
    expect(msg.files.map((f) => [f.kind, f.fileName])).toEqual([
      ['INVOICE', 'IT01234567897_a1B2c.xml.p7m'],
      ['MT', 'IT01234567897_a1B2c_MT_001.xml'],
    ]);
    expect(msg.files[0].content.equals(fixture('fattura.xml'))).toBe(true);
  });

  it('ricevuta di consegna con esito annidato', async () => {
    const inner = mail('Subject: INVIO NOTIFICA ESITO COMMITTENTE\r\n', 'INTERNA', [
      attachment('INTERNA', 'IT01234567897_a1B2c_EC_001.xml', fixture('ec02.xml')),
    ]);
    const msg = await parsePecMessage(envelope(inner, 'CONSEGNA: INVIO NOTIFICA ESITO'));
    expect(msg.files.map((f) => f.kind)).toEqual(['EC']);
  });

  it('newsletter senza file SDI', async () => {
    const msg = await parsePecMessage(
      Buffer.from(
        mail('Message-ID: <news@prova.it>\r\nSubject: Corso\r\n', 'B', [text('B', 'Ciao')]),
      ),
    );
    expect(msg.files).toEqual([]);
  });

  it('p7m illeggibile: file saltato, messaggio valido', async () => {
    const inner = mail('Subject: Invio File 99000000001\r\n', 'INTERNA', [
      attachment('INTERNA', 'IT01234567897_a1B2c.xml.p7m', Buffer.from('non firmato')),
      attachment('INTERNA', 'IT01234567897_a1B2c_MT_001.xml', fixture('mt.xml')),
    ]);
    const msg = await parsePecMessage(envelope(inner, 'Invio File 99000000001'));
    expect(msg.files.map((f) => f.kind)).toEqual(['MT']);
  });
});
