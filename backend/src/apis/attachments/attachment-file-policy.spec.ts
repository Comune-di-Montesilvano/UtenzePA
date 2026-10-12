import { BadRequestException } from '@nestjs/common';
import { checkFile, contentDisposition, extensionOf, maxSizeBytes } from './attachment-file-policy';

const PDF = Buffer.from('%PDF-1.7\n...');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00');

describe('extensionOf', () => {
  it('minuscolo, ultima estensione', () => {
    expect(extensionOf('Delibera 12.2024.PDF')).toBe('pdf');
    expect(extensionOf('atto.pdf.p7m')).toBe('p7m');
    expect(extensionOf('senza_estensione')).toBe('');
    expect(extensionOf('cartella\\file.docx')).toBe('docx');
  });
});

describe('checkFile', () => {
  it('pdf vero: ok con mime dal server', () => {
    expect(checkFile('atto.pdf', PDF)).toEqual({ ext: 'pdf', mime: 'application/pdf' });
  });

  it.each([
    [
      'planimetria.docx',
      ZIP,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['tabella.ods', ZIP, 'application/vnd.oasis.opendocument.spreadsheet'],
    ['vecchio.doc', OLE, 'application/msword'],
    ['email.msg', OLE, 'application/vnd.ms-outlook'],
    ['foto.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['scan.tif', Buffer.from([0x49, 0x49, 0x2a, 0x00]), 'image/tiff'],
    ['atto.pdf.p7m', Buffer.from([0x30, 0x80, 0x06, 0x09]), 'application/pkcs7-mime'],
    ['atto.p7m', Buffer.from('MIAGCSqGSIb3DQEHAqCAMIA'), 'application/pkcs7-mime'],
    ['elenco.csv', Buffer.from('a;b;c\n1;2;3\n'), 'text/csv'],
    ['messaggio.eml', Buffer.from('From: a@example.invalid\r\nSubject: x\r\n'), 'message/rfc822'],
  ])('%s ammesso', (name, head, mime) => {
    expect(checkFile(name, head).mime).toBe(mime);
  });

  it('estensione non ammessa: 400', () => {
    expect(() => checkFile('archivio.zip', ZIP)).toThrow(BadRequestException);
    expect(() => checkFile('setup.exe', EXE)).toThrow('Tipo di file non ammesso (.exe)');
    expect(() => checkFile('senza_estensione', PDF)).toThrow('Tipo di file non ammesso');
  });

  it('contenuto diverso dall’estensione: 400', () => {
    expect(() => checkFile('finto.pdf', EXE)).toThrow(
      'Il contenuto del file non corrisponde al tipo .pdf',
    );
    expect(() => checkFile('finto.pdf', ZIP)).toThrow('non corrisponde al tipo .pdf');
    expect(() => checkFile('finto.txt', Buffer.from([0x4d, 0x5a, 0x00, 0x00]))).toThrow(
      'non corrisponde al tipo .txt',
    );
  });
});

describe('contentDisposition', () => {
  it('accenti e virgolette: fallback ASCII e filename* UTF-8', () => {
    expect(contentDisposition('Verbale "consegna" è.pdf', false)).toBe(
      `attachment; filename="Verbale _consegna_ _.pdf"; filename*=UTF-8''Verbale%20%22consegna%22%20%C3%A8.pdf`,
    );
  });

  it('inline e percorso rimosso dal nome', () => {
    expect(contentDisposition('../../etc/passwd.pdf', true)).toMatch(
      /^inline; filename="passwd.pdf"/,
    );
  });
});

describe('maxSizeBytes', () => {
  const old = process.env.ATTACHMENT_MAX_SIZE_MB;
  afterEach(() => {
    if (old === undefined) delete process.env.ATTACHMENT_MAX_SIZE_MB;
    else process.env.ATTACHMENT_MAX_SIZE_MB = old;
  });

  it('default 50 MB, configurabile, valori non validi → default', () => {
    delete process.env.ATTACHMENT_MAX_SIZE_MB;
    expect(maxSizeBytes()).toBe(50 * 1024 * 1024);
    process.env.ATTACHMENT_MAX_SIZE_MB = '5';
    expect(maxSizeBytes()).toBe(5 * 1024 * 1024);
    process.env.ATTACHMENT_MAX_SIZE_MB = 'abc';
    expect(maxSizeBytes()).toBe(50 * 1024 * 1024);
  });
});
