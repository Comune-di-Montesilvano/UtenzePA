import { annualityFor } from './annuality';

describe('annualityFor', () => {
  it("prende l'annualità dell'anno della riga", () => {
    expect(annualityFor([2026, 2027, 2028], 2027)).toBe(2027);
  });

  it('senza annualità di quell’anno prende la più vicina, a parità la precedente', () => {
    expect(annualityFor([2026], 2025)).toBe(2026);
    expect(annualityFor([2026, 2027], 2029)).toBe(2027);
    expect(annualityFor([2025, 2027], 2026)).toBe(2025);
  });

  it('nessuna annualità = nessun anno', () => {
    expect(annualityFor([], 2026)).toBeNull();
  });
});
