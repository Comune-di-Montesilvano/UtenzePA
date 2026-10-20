import { readFileSync } from 'fs';
import { join } from 'path';
import { joinTextItems, pdfText } from './pdf-text';

describe('joinTextItems', () => {
  it('a capo a fine riga, spazio tra i pezzi, pagine separate', () => {
    const text = joinTextItems([
      [{ str: 'Consumi', hasEOL: false }, { str: '2 Smc', hasEOL: true }, { str: 'fine' }],
      [{ str: 'pagina 2' }, {}],
    ]);
    expect(text).toBe('Consumi 2 Smc\nfine \npagina 2 ');
  });

  it('ricompone i numeri spezzati dall’impaginazione, lascia separati gli altri', () => {
    const text = joinTextItems([[{ str: '137,000   954,000   4.078 , 000   kWh 0, 000' }]]);
    expect(text).toBe('137,000   954,000   4.078,000   kWh 0,000 ');
  });
});

describe('pdfText', () => {
  it('XML senza PDF allegato: null senza caricare pdfjs', async () => {
    const xml = readFileSync(join(__dirname, 'fixtures', 'fattura-pod.xml'));
    await expect(pdfText(xml)).resolves.toBeNull();
  });
});
