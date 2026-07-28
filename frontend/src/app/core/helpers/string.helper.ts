export class StringHelper {
  static truncateAt(value: string | null | undefined, maxLength: number, ellipsis = '…'): string {
    if (!value) return '';
    return value.length > maxLength ? value.substring(0, maxLength) + ellipsis : value;
  }
}
