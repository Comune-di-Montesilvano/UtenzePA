import fc from 'fast-check';
import { escapeLdapDnValue, escapeLdapFilterValue } from './ldap-escape';

// Test di proprietà (fuzzing con fast-check): lo username arriva dal form di login, quindi
// qualsiasi stringa, anche con caratteri di controllo e Unicode, deve restare un valore.

/** Inverso di RFC 4515: `\XX` esadecimale → carattere. */
function unescapeFilter(s: string): string {
  return s.replace(/\\([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Token di un valore di DN: coppia `\<carattere>` (escaped) o carattere singolo. */
function dnTokens(s: string): { c: string; escaped: boolean }[] {
  const out: { c: string; escaped: boolean }[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) out.push({ c: s[++i], escaped: true });
    else out.push({ c: s[i], escaped: false });
  }
  return out;
}

/** Inverso di RFC 4514 per la forma `\<carattere>` usata da escapeLdapDnValue. */
function unescapeDn(s: string): string {
  return dnTokens(s)
    .map((t) => t.c)
    .join('');
}

// Stringhe qualsiasi più stringhe fatte quasi solo di caratteri speciali di filtri e DN, che
// le stringhe casuali raramente combinano (es. `\` seguito da spazio finale).
const special = fc
  .array(
    fc.constantFrom(
      '\\',
      '*',
      '(',
      ')',
      '\u0000',
      ',',
      '+',
      '"',
      '<',
      '>',
      ';',
      '=',
      '#',
      ' ',
      'a',
      'è',
    ),
    {
      maxLength: 12,
    },
  )
  .map((chars) => chars.join(''));
const anyString = fc.oneof(fc.string({ unit: 'binary', maxLength: 64 }), special);

describe('escapeLdapFilterValue: proprietà', () => {
  it('nessun * ( ) o NUL fuori escape, ogni \\ seguito da due cifre esadecimali', () => {
    fc.assert(
      fc.property(anyString, (value) => {
        const out = escapeLdapFilterValue(value);
        expect(out).not.toMatch(/[*()\u0000]/);
        expect(out.replace(/\\[0-9a-f]{2}/gi, '')).not.toContain('\\');
      }),
    );
  });

  it("l'escape si inverte: il server LDAP riceve esattamente il valore digitato", () => {
    fc.assert(
      fc.property(anyString, (value) =>
        expect(unescapeFilter(escapeLdapFilterValue(value))).toBe(value),
      ),
    );
  });
});

describe('escapeLdapDnValue: proprietà', () => {
  it('nessun carattere speciale del DN fuori escape', () => {
    fc.assert(
      fc.property(anyString, (value) => {
        const tokens = dnTokens(escapeLdapDnValue(value));
        const raw = tokens.filter((t) => !t.escaped).map((t) => t.c);
        expect(raw.join('')).not.toMatch(/[\\,+"<>;=]/);
        // # o spazio iniziale e spazio finale sempre con escape.
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        if (first && !first.escaped) expect(['#', ' ']).not.toContain(first.c);
        if (last && !last.escaped) expect(last.c).not.toBe(' ');
      }),
    );
  });

  it("l'escape si inverte", () => {
    fc.assert(
      fc.property(anyString, (value) => expect(unescapeDn(escapeLdapDnValue(value))).toBe(value)),
    );
  });
});
