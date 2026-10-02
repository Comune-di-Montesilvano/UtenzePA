import { FULL_ACCESS_ROLES, maskParty } from '@apis/third-parties/third-party.privacy';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';

// CF e telefono delle parti persone fisiche visibili solo ad Admin/Operatore,
// anche nelle risposte annidate di immobili e utenze. I permessi di
// scrittura granulari sono un giro successivo (roadmap).
interface PartyLike {
  type?: ThirdPartyType | null;
  tax_code?: string | null;
  phone?: string | null;
}

export function maskContract<T extends { parties?: PartyLike[] }>(grant: T, role?: string): T {
  if (!grant?.parties || FULL_ACCESS_ROLES.has(role ?? '')) return grant;
  return { ...grant, parties: grant.parties.map((p) => maskParty(p, role)) };
}

export function maskAssetGrants<T extends { utilizerGrants?: unknown[] }>(
  asset: T,
  role?: string,
): T {
  if (!asset?.utilizerGrants || FULL_ACCESS_ROLES.has(role ?? '')) return asset;
  return {
    ...asset,
    utilizerGrants: asset.utilizerGrants.map((g) => maskContract(g as never, role)),
  };
}

export function maskUtility<T extends { assets?: { utilizerGrants?: unknown[] }[] }>(
  utility: T,
  role?: string,
): T {
  if (!utility?.assets || FULL_ACCESS_ROLES.has(role ?? '')) return utility;
  return { ...utility, assets: utility.assets.map((a) => maskAssetGrants(a, role)) };
}
