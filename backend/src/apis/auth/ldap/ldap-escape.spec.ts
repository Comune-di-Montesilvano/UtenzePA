import { escapeLdapDnValue, escapeLdapFilterValue } from './ldap-escape';

describe('escapeLdapFilterValue (RFC 4515)', () => {
  it("mette l'escape su \\ * ( ) e NUL", () => {
    expect(escapeLdapFilterValue('a*b(c)d\\e\u0000')).toBe('a\\2ab\\28c\\29d\\5ce\\00');
  });

  it('lascia invariati UPN, apostrofi, accenti e spazi', () => {
    expect(escapeLdapFilterValue("mario.d'addiego@ente.it")).toBe("mario.d'addiego@ente.it");
    expect(escapeLdapFilterValue('Niccolò Rossi')).toBe('Niccolò Rossi');
  });
});

describe('escapeLdapDnValue (RFC 4514)', () => {
  it("mette l'escape sui caratteri speciali del DN", () => {
    expect(escapeLdapDnValue('Rossi, Mario')).toBe('Rossi\\, Mario');
    expect(escapeLdapDnValue('a+b"c\\d<e>f;g=h')).toBe('a\\+b\\"c\\\\d\\<e\\>f\\;g\\=h');
  });

  it("mette l'escape su # iniziale e su spazi iniziali e finali", () => {
    expect(escapeLdapDnValue('#x')).toBe('\\#x');
    expect(escapeLdapDnValue(' x ')).toBe('\\ x\\ ');
  });

  // Trovato dal test di proprietà: lo spazio dopo un \ protetto sembrava già protetto.
  it("mette l'escape sullo spazio finale anche dopo un backslash", () => {
    expect(escapeLdapDnValue('a\\ ')).toBe('a\\\\\\ ');
    expect(escapeLdapDnValue('\\ ')).toBe('\\\\\\ ');
  });

  it('protegge una volta sola uno spazio che è insieme iniziale e finale', () => {
    expect(escapeLdapDnValue(' ')).toBe('\\ ');
    expect(escapeLdapDnValue('  ')).toBe('\\ \\ ');
  });

  it('lascia invariato un nome semplice', () => {
    expect(escapeLdapDnValue('mario.rossi')).toBe('mario.rossi');
  });
});
