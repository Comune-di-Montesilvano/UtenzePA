// Il codice fiscale della controparte è visibile solo ad Admin/Operatore
// (oscurato lato backend, anche nelle risposte annidate di immobili/utenze).
// I permessi di scrittura granulari sono un giro successivo (roadmap).
const FULL_ACCESS = new Set(['Admin', 'Operatore']);

interface UtilizerLike {
  tax_code?: string | null;
}

export function maskUtilizer<T extends UtilizerLike>(u: T, role?: string): T {
  if (!u || FULL_ACCESS.has(role ?? '')) return u;
  return { ...u, tax_code: null };
}

export function maskContract<T extends { utilizer?: UtilizerLike }>(grant: T, role?: string): T {
  if (!grant?.utilizer || FULL_ACCESS.has(role ?? '')) return grant;
  return { ...grant, utilizer: maskUtilizer(grant.utilizer, role) };
}

export function maskAssetGrants<T extends { utilizerGrants?: unknown[] }>(
  asset: T,
  role?: string,
): T {
  if (!asset?.utilizerGrants || FULL_ACCESS.has(role ?? '')) return asset;
  return {
    ...asset,
    utilizerGrants: asset.utilizerGrants.map((g) => maskContract(g as never, role)),
  };
}

export function maskUtility<T extends { assets?: { utilizerGrants?: unknown[] }[] }>(
  utility: T,
  role?: string,
): T {
  if (!utility?.assets || FULL_ACCESS.has(role ?? '')) return utility;
  return { ...utility, assets: utility.assets.map((a) => maskAssetGrants(a, role)) };
}
