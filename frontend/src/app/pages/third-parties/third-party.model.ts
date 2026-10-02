export enum ThirdPartyType {
  NATURAL = 'NATURAL',
  LEGAL = 'LEGAL',
}

// Ruoli calcolati dal backend dai collegamenti; UNLINKED vale solo come filtro.
export enum PartyRole {
  SUPPLIER = 'supplier',
  LESSOR = 'lessor',
  TENANT = 'tenant',
  UNLINKED = 'unlinked',
}

export const TYPE_LABEL: Record<ThirdPartyType, string> = {
  [ThirdPartyType.LEGAL]: 'Soggetto giuridico',
  [ThirdPartyType.NATURAL]: 'Persona fisica',
};

export const ROLE_LABEL: Record<PartyRole, string> = {
  [PartyRole.SUPPLIER]: 'Fornitori',
  [PartyRole.LESSOR]: 'Locatori',
  [PartyRole.TENANT]: 'Conduttori',
  [PartyRole.UNLINKED]: 'Senza collegamenti',
};

// P.IVA per i giuridici, codice fiscale per le persone.
export function partyIdentifier(p: {type?: string | null; vat_number?: string | null; tax_code?: string | null}): string {
  return (p.type === ThirdPartyType.NATURAL ? p.tax_code : p.vat_number) ?? '';
}
