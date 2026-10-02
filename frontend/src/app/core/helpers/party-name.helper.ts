// Nome visualizzato di un soggetto terzo: denominazione per i giuridici,
// "Cognome Nome" per le persone fisiche. Stessa regola del backend.
export interface PartyNameFields {
  type?: string | null;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
}

export function partyName(p: PartyNameFields | null | undefined): string {
  if (!p) return '';
  const person = [p.last_name, p.first_name].filter(Boolean).join(' ');
  return p.type === 'NATURAL' ? person : (p.company_name ?? person);
}

export function partyNames(ps: PartyNameFields[] | null | undefined): string {
  return (ps ?? []).map(partyName).filter(Boolean).join(', ');
}
