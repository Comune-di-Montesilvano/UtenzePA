/**
 * Escape dei valori messi nei filtri LDAP (RFC 4515): `\` per primo, poi `*`, `(`, `)` e NUL.
 * Accenti, apostrofi, `@` e spazi restano invariati.
 */
export function escapeLdapFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .split(String.fromCharCode(0))
    .join('\\00');
}

/**
 * Escape di un valore di attributo dentro un DN (RFC 4514): `\ , + " < > ; =` preceduti da `\`,
 * più `#` o spazio iniziale e spazio finale.
 */
export function escapeLdapDnValue(value: string): string {
  let escaped = value.replace(/[\\,+"<>;=]/g, (c) => `\\${c}`);
  if (escaped.startsWith('#') || escaped.startsWith(' ')) escaped = `\\${escaped}`;
  if (escaped.endsWith(' ') && !escaped.endsWith('\\ ')) escaped = `${escaped.slice(0, -1)}\\ `;
  return escaped;
}
