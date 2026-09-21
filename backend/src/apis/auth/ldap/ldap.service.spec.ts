import { Test } from '@nestjs/testing';
import * as ldapjs from 'ldapjs';
import { LdapService } from './ldap.service';

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));

const mockClient = {
  bind: jest.fn(),
  search: jest.fn(),
  unbind: jest.fn(),
};

describe('LdapService', () => {
  let service: LdapService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    (ldapjs.createClient as jest.Mock).mockReturnValue(mockClient);
    mockClient.unbind.mockImplementation((cb: () => void) => cb());

    process.env = {
      ...originalEnv,
      LDAP_HOST: 'ldap://localhost:389',
      LDAP_BASE_DN: 'DC=test,DC=local',
      LDAP_USER_DN_TEMPLATE: '%s@test.local',
      LDAP_TLS_SKIP_VERIFY: 'true',
      LDAP_REQUIRED_GROUP: 'UTENZEPA_LETTORI',
    };

    const module = await Test.createTestingModule({ providers: [LdapService] }).compile();
    service = module.get<LdapService>(LdapService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isConfigured', () => {
    it('true se LDAP_HOST è valorizzato', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('false se LDAP_HOST è assente', () => {
      delete process.env.LDAP_HOST;
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('authenticate (server reale)', () => {
    it('autentica utente membro diretto del gruppo richiesto', async () => {
      mockClient.bind.mockImplementation((_dn: string, _pw: string, cb: (err: null) => void) =>
        cb(null),
      );

      const mockSearchRes = {
        on: jest.fn().mockImplementation(function (
          this: typeof mockSearchRes,
          event: string,
          cb: (...args: unknown[]) => void,
        ) {
          if (event === 'searchEntry') {
            cb({
              object: {
                sAMAccountName: 'mario.rossi',
                displayName: 'Mario Rossi',
                memberOf: ['CN=UTENZEPA_LETTORI,OU=Groups,DC=test,DC=local'],
              },
            });
          }
          if (event === 'end') cb({ status: 0 });
          return this;
        }),
      };

      mockClient.search.mockImplementation(
        (_base: string, _opts: unknown, cb: (err: null, res: typeof mockSearchRes) => void) =>
          cb(null, mockSearchRes),
      );

      const result = await service.authenticate('mario.rossi', 'password123');

      expect(result.username).toBe('mario.rossi');
      expect(result.displayName).toBe('Mario Rossi');
    });

    it('autentica utente membro ricorsivo del gruppo richiesto', async () => {
      mockClient.bind.mockImplementation((_dn: string, _pw: string, cb: (err: null) => void) =>
        cb(null),
      );

      mockClient.search.mockImplementation((_base: string, searchOpts: any, cb: any) => {
        const filter = searchOpts.filter || '';
        const mockSearchRes = {
          on: jest.fn().mockImplementation(function (
            this: typeof mockSearchRes,
            event: string,
            eventCb: (...args: unknown[]) => void,
          ) {
            if (event === 'searchEntry') {
              if (filter.includes('1.2.840.113556.1.4.1941')) {
                eventCb({ object: { sAMAccountName: 'mario.rossi' } });
              } else if (filter.includes('sAMAccountName=mario.rossi')) {
                eventCb({
                  object: {
                    sAMAccountName: 'mario.rossi',
                    displayName: 'Mario Rossi',
                    memberOf: ['CN=UNRELATED_GROUP,OU=Groups,DC=test,DC=local'],
                  },
                });
              } else if (filter.includes('objectClass=group')) {
                eventCb({
                  object: {
                    distinguishedName: 'CN=UTENZEPA_LETTORI,OU=Groups,DC=test,DC=local',
                  },
                });
              }
            }
            if (event === 'end') eventCb({ status: 0 });
            return this;
          }),
        };
        cb(null, mockSearchRes);
      });

      const result = await service.authenticate('mario.rossi', 'password123');

      expect(result.username).toBe('mario.rossi');
    });

    it('rifiuta utente non membro del gruppo richiesto', async () => {
      mockClient.bind.mockImplementation((_dn: string, _pw: string, cb: (err: null) => void) =>
        cb(null),
      );

      mockClient.search.mockImplementation((_base: string, searchOpts: any, cb: any) => {
        const filter = searchOpts.filter || '';
        const mockSearchRes = {
          on: jest.fn().mockImplementation(function (
            this: typeof mockSearchRes,
            event: string,
            eventCb: (...args: unknown[]) => void,
          ) {
            if (event === 'searchEntry' && filter.includes('sAMAccountName=mario.rossi')) {
              eventCb({
                object: {
                  sAMAccountName: 'mario.rossi',
                  displayName: 'Mario Rossi',
                  memberOf: ['CN=UNRELATED_GROUP,OU=Groups,DC=test,DC=local'],
                },
              });
            }
            if (event === 'end') eventCb({ status: 0 });
            return this;
          }),
        };
        cb(null, mockSearchRes);
      });

      await expect(service.authenticate('mario.rossi', 'password123')).rejects.toThrow(
        'Accesso non autorizzato: gruppo AD richiesto non trovato',
      );
    });

    it('rifiuta se il bind fallisce (password errata)', async () => {
      mockClient.bind.mockImplementation(
        (_dn: string, _pw: string, cb: (err: Error) => void) =>
          cb(new Error('Invalid credentials')),
      );

      await expect(service.authenticate('mario.rossi', 'wrongpass')).rejects.toThrow(
        'Credenziali non valide',
      );
    });

    it('non applica nessun gate se LDAP_REQUIRED_GROUP è vuoto', async () => {
      process.env.LDAP_REQUIRED_GROUP = '';
      const module = await Test.createTestingModule({ providers: [LdapService] }).compile();
      service = module.get<LdapService>(LdapService);

      mockClient.bind.mockImplementation((_dn: string, _pw: string, cb: (err: null) => void) =>
        cb(null),
      );

      const mockSearchRes = {
        on: jest.fn().mockImplementation(function (
          this: typeof mockSearchRes,
          event: string,
          cb: (...args: unknown[]) => void,
        ) {
          if (event === 'searchEntry') {
            cb({ object: { sAMAccountName: 'mario.rossi', displayName: 'Mario Rossi' } });
          }
          if (event === 'end') cb({ status: 0 });
          return this;
        }),
      };

      mockClient.search.mockImplementation(
        (_base: string, _opts: unknown, cb: (err: null, res: typeof mockSearchRes) => void) =>
          cb(null, mockSearchRes),
      );

      const result = await service.authenticate('mario.rossi', 'password123');

      expect(result.username).toBe('mario.rossi');
    });
  });

  describe('mock mode (LDAP_HOST=mock)', () => {
    beforeEach(async () => {
      process.env.LDAP_HOST = 'mock';
      const module = await Test.createTestingModule({ providers: [LdapService] }).compile();
      service = module.get<LdapService>(LdapService);
    });

    it('accetta lettore/lettore senza contattare LDAP', async () => {
      const result = await service.authenticate('lettore', 'lettore');
      expect(result.username).toBe('lettore');
      expect(ldapjs.createClient).not.toHaveBeenCalled();
    });

    it('rifiuta qualsiasi altra credenziale senza contattare LDAP', async () => {
      await expect(service.authenticate('lettore', 'wrong')).rejects.toThrow(
        'Credenziali non valide',
      );
      expect(ldapjs.createClient).not.toHaveBeenCalled();
    });
  });
});
