import { majority, planMerge } from './merge-contracts.lib';

describe('merge-contracts.lib', () => {
  describe('majority', () => {
    it('valore più frequente, null conta come valore', () => {
      expect(majority([null, null, '2023-01-01'])).toBeNull();
      expect(majority(['2022-07-01', '2022-07-01', '2022-09-14'])).toBe('2022-07-01');
    });

    it('a parità vince il primo incontrato', () => {
      expect(majority([5, 7])).toBe(5);
    });
  });

  describe('planMerge', () => {
    const base = {
      supplier_id_fk: 1,
      consip_agreement_id: 10,
      cig_contract: 'CIG1',
      order_number: null,
      supply_start_date: '2026-09-01',
      supply_expiry_date: '2027-08-31',
      management_expiry_date: null,
      takeover_termination_date: null,
      security_deposit: '0.00',
    };

    it('superstite = id minore, campi a maggioranza, divergenze elencate', () => {
      const plan = planMerge([
        { ...base, id: 30, takeover_termination_date: '2022-09-14' },
        { ...base, id: 12, takeover_termination_date: '2022-07-01' },
        { ...base, id: 20, takeover_termination_date: '2022-07-01' },
      ]);
      expect(plan.survivorId).toBe(12);
      expect(plan.removedIds).toEqual([20, 30]);
      expect(plan.fields.takeover_termination_date).toBe('2022-07-01');
      expect(plan.divergences).toEqual([
        { field: 'takeover_termination_date', contractId: 30, value: '2022-09-14', chosen: '2022-07-01' },
      ]);
    });

    it('override esplicito vince sulla maggioranza (es. convenzione mancante sulla maggioranza)', () => {
      const plan = planMerge(
        [
          { ...base, id: 1, consip_agreement_id: null },
          { ...base, id: 2, consip_agreement_id: 10 },
          { ...base, id: 3, consip_agreement_id: null, supplier_id_fk: 9 },
        ],
        { consip_agreement_id: 10, supplier_id_fk: 1 },
      );
      expect(plan.fields.consip_agreement_id).toBe(10);
      expect(plan.fields.supplier_id_fk).toBe(1);
    });

    it('decimal stringa e numero equivalenti non sono divergenze', () => {
      const plan = planMerge([
        { ...base, id: 1, security_deposit: '0.00' },
        { ...base, id: 2, security_deposit: 0 },
      ]);
      expect(plan.divergences).toEqual([]);
    });

    it('date come Date o stringa equivalenti', () => {
      const plan = planMerge([
        { ...base, id: 1, supply_start_date: new Date('2026-09-01T00:00:00Z') },
        { ...base, id: 2, supply_start_date: '2026-09-01' },
      ]);
      expect(plan.divergences).toEqual([]);
      expect(plan.fields.supply_start_date).toBe('2026-09-01');
    });
  });
});
