export class DateHelper {
  static isoToLocalDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    const d = new Date(value);
    if (isNaN(d.getTime())) return null;

    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  static toLocalIsoString(date: Date | null | undefined): string | null {
    if (!date) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
