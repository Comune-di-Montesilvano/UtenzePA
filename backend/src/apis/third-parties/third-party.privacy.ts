import { ThirdPartyType } from './enum/third-party.enum';

// CF e telefono delle persone fisiche visibili solo ad Admin/Operatore.
// I dati dei soggetti giuridici sono pubblici.
export const FULL_ACCESS_ROLES = new Set(['Admin', 'Operatore']);

export function maskParty<
  T extends { type?: ThirdPartyType | null; tax_code?: string | null; phone?: string | null },
>(p: T, role?: string): T {
  if (!p || FULL_ACCESS_ROLES.has(role ?? '') || p.type !== ThirdPartyType.NATURAL) return p;
  return { ...p, tax_code: null, phone: null };
}
