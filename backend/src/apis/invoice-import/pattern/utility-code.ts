// Codice utenza letto dalla fattura → forma di utilities.utility_id: PDR a 14
// cifre con zeri a sinistra, POD a 14 caratteri (alcuni fornitori ne mettono 15).
export function normalizeUtilityCode(value: string): string {
  const code = value.replace(/\s+/g, '').toUpperCase();
  if (/^\d{11,14}$/.test(code)) return code.padStart(14, '0');
  if (/^IT\w{13}$/.test(code)) return code.slice(0, 14);
  return code;
}
