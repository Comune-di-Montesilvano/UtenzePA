import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as ldapjs from 'ldapjs';

export interface LdapUser {
  username: string;
  displayName: string;
}

@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);

  isConfigured(): boolean {
    return !!process.env.LDAP_HOST;
  }

  async authenticate(username: string, password: string): Promise<LdapUser> {
    const host = process.env.LDAP_HOST;

    // Credenziali simulate SOLO in sviluppo locale (LDAP_HOST=mock):
    // con un host reale non esiste alcun bypass.
    if (host === 'mock') {
      if (username === 'lettore' && password === 'lettore') {
        return { username: 'lettore', displayName: 'Lettore Simulato' };
      }
      throw new UnauthorizedException('Credenziali non valide');
    }

    if (!host) {
      throw new UnauthorizedException('Servizio LDAP non configurato');
    }

    const baseDn = process.env.LDAP_BASE_DN || '';
    const dnTemplate = process.env.LDAP_USER_DN_TEMPLATE || '%s';
    const tlsSkipVerify = process.env.LDAP_TLS_SKIP_VERIFY === 'true';
    const requiredGroup = process.env.LDAP_REQUIRED_GROUP || '';
    const userDn = dnTemplate.replace('%s', username);

    return this.connectAndAuthenticate({
      host,
      baseDn,
      userDn,
      username,
      password,
      tlsSkipVerify,
      requiredGroup,
    });
  }

  private async connectAndAuthenticate(opts: {
    host: string;
    baseDn: string;
    userDn: string;
    username: string;
    password: string;
    tlsSkipVerify: boolean;
    requiredGroup: string;
  }): Promise<LdapUser> {
    const client = ldapjs.createClient({
      url: opts.host,
      tlsOptions: { rejectUnauthorized: !opts.tlsSkipVerify },
      timeout: 5000,
      connectTimeout: 5000,
      referrals: false,
    } as any);

    try {
      await this.bind(client, opts.userDn, opts.password);
      const entry = await this.searchUser(client, opts.baseDn, opts.username);

      if (!entry) {
        throw new UnauthorizedException('Utente non trovato in Active Directory');
      }

      if (opts.requiredGroup) {
        const memberOf = this.extractMemberOf(entry);
        const groupCns = memberOf.map((dn) => this.extractCn(dn));
        let isMember = groupCns.includes(opts.requiredGroup);

        if (!isMember) {
          try {
            const groupDn = await this.findGroupDn(client, opts.baseDn, opts.requiredGroup);
            if (groupDn) {
              isMember = await this.checkRecursiveMembership(
                client,
                opts.baseDn,
                opts.username,
                groupDn,
              );
            }
          } catch (groupError) {
            this.logger.warn(
              `Errore nella risoluzione del gruppo ricorsivo per ${opts.username}: ${String(
                groupError,
              )}`,
            );
          }
        }

        if (!isMember) {
          throw new UnauthorizedException(
            'Accesso non autorizzato: gruppo AD richiesto non trovato',
          );
        }
      }

      const givenName = String(entry['givenName'] ?? entry['givenname'] ?? '');
      const sn = String(entry['sn'] ?? entry['surname'] ?? '');
      const fullNameFromParts = givenName && sn ? `${givenName} ${sn}`.trim() : null;

      const rawDisplayName =
        entry['displayName'] ??
        entry['displayname'] ??
        fullNameFromParts ??
        entry['cn'] ??
        opts.username;

      return {
        username: opts.username,
        displayName: String(rawDisplayName),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`LDAP error for user ${opts.username}: ${String(error)}`);
      throw new UnauthorizedException('Credenziali non valide');
    } finally {
      client.unbind(() => {
        /* fire and forget */
      });
    }
  }

  private async findGroupDn(
    client: ldapjs.Client,
    baseDn: string,
    groupCn: string,
  ): Promise<string | null> {
    const filter = `(&(objectClass=group)(cn=${groupCn}))`;
    return new Promise((resolve) => {
      let dn: string | null = null;
      client.search(
        baseDn,
        { scope: 'sub', filter, attributes: ['distinguishedName'], referrals: false } as any,
        (err: any, res: any) => {
          if (err) return resolve(null);

          res.on('searchEntry', (entry: ldapjs.SearchEntry) => {
            const raw = entry as any;
            if (raw.pojo?.attributes) {
              for (const attr of raw.pojo.attributes) {
                if (attr.type === 'distinguishedName') dn = attr.values[0];
              }
            } else if (raw.object) {
              dn = String(raw.object.distinguishedName || raw.object.dn);
            }
            if (!dn && raw.dn) dn = String(raw.dn);
          });
          res.on('error', () => {
            // ignore
          });
          res.on('end', () => resolve(dn));
        },
      );
    });
  }

  private async checkRecursiveMembership(
    client: ldapjs.Client,
    baseDn: string,
    username: string,
    groupDn: string,
  ): Promise<boolean> {
    const filter = `(&(|(sAMAccountName=${username})(userPrincipalName=${username}))(memberOf:1.2.840.113556.1.4.1941:=${groupDn}))`;
    return new Promise((resolve) => {
      let matched = false;
      client.search(
        baseDn,
        { scope: 'sub', filter, attributes: ['sAMAccountName'], referrals: false } as any,
        (err: any, res: any) => {
          if (err) return resolve(false);
          res.on('searchEntry', () => {
            matched = true;
          });
          res.on('error', () => {
            // ignore
          });
          res.on('end', () => resolve(matched));
        },
      );
    });
  }

  private bind(client: ldapjs.Client, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private searchUser(
    client: ldapjs.Client,
    baseDn: string,
    username: string,
  ): Promise<Record<string, unknown> | null> {
    const filter = `(|(sAMAccountName=${username})(userPrincipalName=${username}))`;
    return new Promise((resolve, reject) => {
      let resolved = false;
      let found: Record<string, unknown> | null = null;

      client.search(
        baseDn,
        {
          scope: 'sub',
          filter,
          attributes: [
            'sAMAccountName',
            'displayName',
            'cn',
            'givenName',
            'sn',
            'mail',
            'memberOf',
          ],
          referrals: false,
        } as any,
        (err: any, res: any) => {
          if (err) return reject(err);

          res.on('searchEntry', (entry: ldapjs.SearchEntry) => {
            const raw = entry as unknown as {
              object?: Record<string, unknown>;
              pojo?: { attributes: { type: string; values: string[] }[] };
            };
            const result: Record<string, unknown> = {};
            if (raw.pojo?.attributes) {
              for (const attr of raw.pojo.attributes) {
                result[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
              }
            } else if (raw.object) {
              Object.assign(result, raw.object);
            }
            found = result;
            if (!resolved) {
              resolved = true;
              resolve(found);
            }
          });
          res.on('error', (searchErr: any) => {
            if (!resolved) {
              resolved = true;
              reject(searchErr);
            }
          });
          res.on('end', () => {
            if (!resolved) {
              resolved = true;
              resolve(found);
            }
          });
        },
      );
    });
  }

  private extractMemberOf(entry: Record<string, unknown>): string[] {
    const val = entry['memberOf'] || entry['memberof'];
    if (!val) return [];
    if (Array.isArray(val)) return val as string[];
    return [String(val)];
  }

  private extractCn(dn: string): string {
    const match = /^CN=([^,]+)/i.exec(dn);
    return match ? match[1] : dn;
  }
}
