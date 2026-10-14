import { replacedContractPatch } from './replace-contract';

describe('replacedContractPatch', () => {
  it('scadenza assente: diventa il giorno prima della nuova decorrenza', () => {
    expect(replacedContractPatch(null, '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });

  it('scadenza oltre la nuova decorrenza: accorciata (anche a cavallo d’anno)', () => {
    expect(replacedContractPatch('2027-06-30', '2026-01-01')).toEqual({ closed: true, supply_expiry_date: '2025-12-31' });
  });

  it('scadenza uguale alla nuova decorrenza: accorciata', () => {
    expect(replacedContractPatch('2026-07-01', '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });

  it('scadenza già anteriore: solo chiuso', () => {
    expect(replacedContractPatch('2026-05-31', '2026-07-01')).toEqual({ closed: true });
  });

  it('nuovo contratto senza decorrenza: solo chiuso', () => {
    expect(replacedContractPatch(null, null)).toEqual({ closed: true });
  });

  it('scadenza come Date: confrontata come giorno locale', () => {
    expect(replacedContractPatch(new Date(2026, 11, 31), '2026-07-01')).toEqual({ closed: true, supply_expiry_date: '2026-06-30' });
  });
});
