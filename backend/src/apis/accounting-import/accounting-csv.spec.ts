import { parseAccountingCsv } from './accounting-csv';

describe('parseAccountingCsv', () => {
  it('intestazione in qualsiasi ordine, colonne in più ignorate', () => {
    const { rows, issues } = parseAccountingCsv(
      'chapters',
      'article;extra;year;chapter;initial_budget\n0;x;2026;11407;1000\n',
    );
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        year: 2026,
        chapter: '11407',
        article: 0,
        description: null,
        initial_budget: 1000,
        adjusted_budget: null,
        spent: null,
      },
    ]);
  });

  it('virgola decimale e arrotondamento al centesimo', () => {
    const { rows } = parseAccountingCsv(
      'chapters',
      'year;chapter;article;initial_budget;spent\n2026;1;0;1234,567;75.65000000000001\n',
    );
    expect(rows[0].initial_budget).toBe(1234.57);
    expect(rows[0].spent).toBe(75.65);
  });

  it('riga con importo non numerico scartata, le altre caricate', () => {
    const csv =
      'commitment_year;commitment_num;commitment_sub;fiscal_year;chapter;article;amount\n' +
      '2026;514;1;2026;11407;0;18500\n' +
      '2026;515;1;2026;11407;0;abc\n' +
      '2026;516;1;2026;11407;0;10\n';
    const { rows, issues } = parseAccountingCsv('commitments', csv);
    expect(rows).toHaveLength(2);
    expect(issues).toEqual([{ line: 3, message: expect.stringContaining('amount') }]);
  });

  it('colonna obbligatoria mancante: nessuna riga, un issue sulla riga 1', () => {
    const { rows, issues } = parseAccountingCsv('chapters', 'year;chapter\n2026;1\n');
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 1, message: expect.stringContaining('article') }]);
  });

  it('obbligatoria vuota in una riga = issue su quella riga', () => {
    const { rows, issues } = parseAccountingCsv('chapters', 'year;chapter;article\n2026;;0\n');
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 2, message: expect.stringContaining('chapter') }]);
  });

  it('BOM, virgolette e righe CRLF', () => {
    const { rows, issues } = parseAccountingCsv(
      'chapters',
      '﻿year;chapter;article;description\r\n2026;"11407";0;"SPESE; ENERGIA ""ELETTRICA"""\r\n',
    );
    expect(issues).toEqual([]);
    expect(rows[0].chapter).toBe('11407');
    expect(rows[0].description).toBe('SPESE; ENERGIA "ELETTRICA"');
  });

  it('cancelled vuoto = false, 1 = true', () => {
    const csv =
      'liquidation_key;commitment_year;commitment_num;commitment_sub;fiscal_year;amount;cancelled\n' +
      'L1;2026;514;1;2026;10;\n' +
      'L2;2026;514;1;2026;10;1\n';
    const { rows } = parseAccountingCsv('liquidations', csv);
    expect(rows.map((r) => r.cancelled)).toEqual([false, true]);
  });

  it('data non ISO = issue', () => {
    const csv =
      'liquidation_key;commitment_year;commitment_num;commitment_sub;fiscal_year;amount;invoice_date\n' +
      'L1;2026;514;1;2026;10;24/03/2025\n';
    const { rows, issues } = parseAccountingCsv('liquidations', csv);
    expect(rows).toEqual([]);
    expect(issues).toEqual([{ line: 2, message: expect.stringContaining('invoice_date') }]);
  });

  it('descrizione lunga troncata, altri testi troppo lunghi = issue', () => {
    const long = 'x'.repeat(300);
    const { rows, issues } = parseAccountingCsv(
      'commitments',
      'commitment_year;commitment_num;commitment_sub;fiscal_year;chapter;article;amount;description;cig\n' +
        `2026;1;1;2026;100;0;10;${long};\n` +
        `2026;2;1;2026;100;0;10;;${'C'.repeat(21)}\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toHaveLength(255);
    expect(issues).toEqual([{ line: 3, message: 'cig più lungo di 20 caratteri' }]);
  });

  it('righe vuote ignorate', () => {
    const { rows, issues } = parseAccountingCsv('chapters', 'year;chapter;article\n\n2026;1;0\n\n');
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
