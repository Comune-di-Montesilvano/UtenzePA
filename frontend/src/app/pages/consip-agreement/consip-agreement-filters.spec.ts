import {CONSIP_AGREEMENT_SIGNALS} from './consip-agreement-filters';

describe('CONSIP_AGREEMENT_SIGNALS', () => {
  it('«Impegni insufficienti» legge agreements_commitments_short con gli id delle convenzioni', () => {
    const def = CONSIP_AGREEMENT_SIGNALS.find(s => s.key === 'agreements_commitments_short');
    expect(def?.label).toBe('Impegni insufficienti');
    // Senza ids vale il default dell'elenco: item.id.
    expect(def?.ids).toBeUndefined();
  });
});
