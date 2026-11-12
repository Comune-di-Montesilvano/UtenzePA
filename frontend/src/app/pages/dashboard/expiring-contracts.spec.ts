import {uncoveredUtilityIds} from './expiring-contracts';

type C = Parameters<typeof uncoveredUtilityIds>[0];
const contract = (id: number, start: string | null, end: string | null, utilities: number[], over: Partial<C> = {}): C => ({
  id, supply_start_date: start, supply_expiry_date: end, closed: false, draft: false,
  utilities: utilities.map(u => ({id: u})), ...over,
});

describe('uncoveredUtilityIds', () => {
  const expiring = contract(1, '2025-07-01', '2026-12-31', [10, 11]);

  it('nessun contratto successivo: tutte le utenze scoperte', () => {
    expect(uncoveredUtilityIds(expiring, [expiring])).toEqual([10, 11]);
  });

  it('contratto successivo (anche in bozza) che parte il giorno dopo: coperte', () => {
    const next = contract(2, '2027-01-01', '2027-12-31', [10, 11], {draft: true});
    expect(uncoveredUtilityIds(expiring, [expiring, next])).toEqual([]);
  });

  it('successivo senza date o che parte prima della scadenza e finisce dopo: coperte', () => {
    expect(uncoveredUtilityIds(expiring, [contract(3, null, null, [10, 11])])).toEqual([]);
    expect(uncoveredUtilityIds(expiring, [contract(4, '2026-11-01', '2027-10-31', [10, 11])])).toEqual([]);
  });

  it('copertura parziale: restano le utenze senza successore', () => {
    expect(uncoveredUtilityIds(expiring, [contract(2, '2027-01-01', '2027-12-31', [10])])).toEqual([11]);
  });

  it('non sostituiscono: chiuso, che parte dopo un buco, che scade insieme', () => {
    const others = [
      contract(2, '2027-01-01', '2027-12-31', [10], {closed: true}),
      contract(3, '2027-02-01', '2027-12-31', [10]),
      contract(4, '2026-01-01', '2026-12-31', [10]),
    ];
    expect(uncoveredUtilityIds(expiring, others)).toEqual([10, 11]);
  });
});
