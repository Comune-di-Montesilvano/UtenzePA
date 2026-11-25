import {columnName, crc32, xlsxBytes, zipStore} from './xlsx.helper';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('xlsx.helper', () => {
  it('crc32: valore di controllo standard', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('nomi delle colonne come Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('zip: intestazione locale, file in chiaro, record di chiusura col numero di file', () => {
    const zip = zipStore([['a.txt', 'ciao'], ['b.txt', 'è']]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(text(zip)).toContain('ciao');
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
  });

  it('foglio: numeri come numeri, testo escapato, prima riga in grassetto', () => {
    const xml = text(xlsxBytes([{name: 'Richiesta 2027', rows: [['Capitolo', 'Importo'], ['A & <B>', 12.5], ['vuota', null]]}]));
    expect(xml).toContain('<sheet name="Richiesta 2027"');
    expect(xml).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Capitolo</t></is></c>');
    expect(xml).toContain('<c r="B2" s="2"><v>12.5</v></c>');
    expect(xml).toContain('A &amp; &lt;B&gt;');
    expect(xml).not.toContain('r="B3"');
  });
});
