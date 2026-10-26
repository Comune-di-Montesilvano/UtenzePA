import { normalizeInvoiceNumber } from './invoice-number';

describe('normalizeInvoiceNumber', () => {
  it('toglie gli zeri iniziali', () => {
    expect(normalizeInvoiceNumber('0150020250000011500')).toBe('150020250000011500');
  });

  it('solo lettere e cifre, in maiuscolo', () => {
    expect(normalizeInvoiceNumber('FT/12')).toBe('FT12');
    expect(normalizeInvoiceNumber('ft-12')).toBe('FT12');
  });
});
