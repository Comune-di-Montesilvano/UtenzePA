// Durata del token di accesso in secondi, da JWT_EXPIRES_IN: numero di
// secondi oppure numero con unità s/m/h/d (es. "1h", "45m"). Valore assente o
// non valido = 1 ora: un token senza scadenza resterebbe valido per sempre.
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
export const DEFAULT_JWT_EXPIRES_IN = 3600;

export function jwtExpiresInSeconds(
  value: string | undefined = process.env.JWT_EXPIRES_IN,
): number {
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value ?? '');
  if (!match) return DEFAULT_JWT_EXPIRES_IN;
  const seconds = Number(match[1]) * UNIT_SECONDS[(match[2] || 's').toLowerCase()];
  return seconds > 0 ? seconds : DEFAULT_JWT_EXPIRES_IN;
}
