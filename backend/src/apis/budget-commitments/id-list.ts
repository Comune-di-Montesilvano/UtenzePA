// Elenco di id da JSON_ARRAYAGG (mysql2 lo restituisce già decodificato, i
// mock come stringa): ordinato, vuoto senza collegamenti. JSON_ARRAYAGG e non
// GROUP_CONCAT, che si tronca oltre group_concat_max_len (1024 caratteri).
export function idList(value: unknown): number[] {
  if (value === null || value === undefined || value === '') return [];
  const raw = Array.isArray(value)
    ? value
    : String(value).trim().startsWith('[')
      ? (JSON.parse(String(value)) as unknown[])
      : String(value).split(',');
  return raw.map(Number).sort((a, b) => a - b);
}
