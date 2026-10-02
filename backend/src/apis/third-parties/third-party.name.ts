import { ThirdPartyType } from './enum/third-party.enum';

export interface PartyFields {
  type?: ThirdPartyType | null;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
}

export function partyName(p: PartyFields | null | undefined): string {
  if (!p) return '';
  const person = [p.last_name, p.first_name].filter(Boolean).join(' ');
  return p.type === ThirdPartyType.NATURAL ? person : (p.company_name ?? person);
}

// Stessa regola di partyName, per le query SQL grezze (anomalie).
export function partyNameSql(alias: string): string {
  return `(CASE WHEN ${alias}.type = 'NATURAL' THEN TRIM(CONCAT_WS(' ', ${alias}.last_name, ${alias}.first_name)) ELSE ${alias}.company_name END)`;
}
