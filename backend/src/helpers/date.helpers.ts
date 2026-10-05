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
