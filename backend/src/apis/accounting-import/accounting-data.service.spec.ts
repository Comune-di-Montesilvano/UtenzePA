import { SUPPLIERS_SQL } from './accounting-data.service';

describe('fornitori in perimetro per la contabilità', () => {
  it('una bozza da sola non mette il fornitore in perimetro', () => {
    expect(SUPPLIERS_SQL).toContain('c.draft = 0');
  });
});
