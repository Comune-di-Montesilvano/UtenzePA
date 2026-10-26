// Colonna DATE da una query grezza: mysql2 la restituisce come Date a
// mezzanotte locale, l'entity come stringa.
export function dbDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

export class DateHelper {
  static mysqlDate(value: Date): string {
    const d = new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Primi 10 caratteri di una data ricevuta dal client ('AAAA-MM-GG' o ISO
  // completo), senza conversioni di fuso. '' → null; altri tipi invariati,
  // così la validazione li rifiuta.
  static dateOnly<T>(value: T): T | string | null {
    if (value === '') return null;
    return typeof value === 'string' ? value.slice(0, 10) : value;
  }
}
