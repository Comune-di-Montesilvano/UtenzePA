import { imapConfigFromEnv } from './pec-imap.client';

describe('imapConfigFromEnv', () => {
  it('porta 993 e TLS di default', () => {
    expect(
      imapConfigFromEnv({
        PEC_IMAP_HOST: 'imap.prova.it',
        PEC_IMAP_USER: 'sdi@prova.it',
        PEC_IMAP_PASSWORD: 'x',
      }),
    ).toEqual({
      host: 'imap.prova.it',
      port: 993,
      secure: true,
      user: 'sdi@prova.it',
      password: 'x',
    });
  });

  it('porta e TLS dalle variabili', () => {
    expect(
      imapConfigFromEnv({
        PEC_IMAP_HOST: 'h',
        PEC_IMAP_PORT: '143',
        PEC_IMAP_TLS: 'false',
        PEC_IMAP_USER: 'u',
        PEC_IMAP_PASSWORD: 'p',
      }),
    ).toMatchObject({ port: 143, secure: false });
  });

  it('senza password: non configurato', () => {
    expect(imapConfigFromEnv({ PEC_IMAP_HOST: 'h', PEC_IMAP_USER: 'u' })).toBeNull();
  });
});
