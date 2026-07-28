export class ExportHelper {
  static formatDate(value: unknown): string {
    if (!value) return '';
    const d = new Date(value as string);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  static boolData(value: unknown): string {
    if (value === true) return 'Sì';
    if (value === false) return 'No';
    return '';
  }
}
