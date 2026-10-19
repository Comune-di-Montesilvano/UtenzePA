import { parsePecMessage } from './pec-message';
import { attachment, envelope, fixture, mail, text } from './fixtures/eml';

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
