import {COMMITMENT_SIGNALS} from './commitments-filters';

describe('COMMITMENT_SIGNALS', () => {
  it('convenzione con impegni insufficienti: impegni di tutte le convenzioni, senza doppioni', () => {
    const def = COMMITMENT_SIGNALS.find(s => s.key === 'agreements_commitments_short');
    expect(def?.label).toBe('Convenzione con impegni insufficienti');
    expect(def?.ids?.([
      {id: 3, commitment_ids: [10, 11]},
      {id: 4, commitment_ids: [11, 12]},
      {id: 5, commitment_ids: []},
    ])).toEqual([10, 11, 12]);
  });
});
