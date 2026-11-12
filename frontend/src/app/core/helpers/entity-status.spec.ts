import {agreementForecastStatus, supplyContractFlags, supplyContractStatus, sortSupplyContracts} from './entity-status';
import {ContractKind} from '../../pages/contracts/contract-kind';

describe('ordine in bozza', () => {
  const today = '2026-11-11';

  it('stato Bozza, mai «in corso»', () => {
    const status = supplyContractStatus({draft: true, supply_start_date: '2026-01-01', supply_expiry_date: '2027-12-31'}, today);
    expect(status.label).toBe('Bozza');
    expect(status.tone).not.toBe('ok');
  });

  it('Bozza prima di ogni altro stato, anche con scadenza passata', () => {
    expect(supplyContractStatus({draft: true, supply_expiry_date: '2020-01-01'}, today).label).toBe('Bozza');
  });

  it('un contratto non in bozza resta com\'era', () => {
    expect(supplyContractStatus({draft: false, supply_expiry_date: '2027-12-31'}, today).label).toBe('In corso');
  });

  it('nessun avviso di CIG mancante sulla bozza', () => {
    expect(supplyContractFlags({draft: true, cig_contract: '', contract_kind: ContractKind.STANDARD})).toEqual([]);
    expect(supplyContractFlags({draft: false, cig_contract: '', contract_kind: ContractKind.STANDARD})[0].label).toBe('Senza CIG');
  });

  it('nell\'ordinamento la bozza non passa davanti ai contratti in corso', () => {
    const sorted = sortSupplyContracts([
      {id: 1, draft: true, supply_start_date: '2027-01-01', supply_expiry_date: '2027-12-31'},
      {id: 2, supply_start_date: '2026-01-01', supply_expiry_date: '2026-12-31'},
    ], today);
    expect(sorted.map(c => c.id)).toEqual([2, 1]);
  });
});

describe('fabbisogno della convenzione', () => {
  it('«Impegni insufficienti» con un ammanco nell’esercizio in corso', () => {
    const status = agreementForecastStatus([{year: 2026, alert: null}, {year: 2026, alert: 'short'}], 2026);
    expect(status?.label).toBe('Impegni insufficienti');
    expect(status?.tone).toBe('danger');
  });

  it('niente badge per ammanchi di altri esercizi, dati insufficienti o senza righe', () => {
    expect(agreementForecastStatus([{year: 2027, alert: 'short'}], 2026)).toBeNull();
    expect(agreementForecastStatus([{year: 2026, alert: 'insufficient_data'}], 2026)).toBeNull();
    expect(agreementForecastStatus([], 2026)).toBeNull();
    expect(agreementForecastStatus(null, 2026)).toBeNull();
  });
});
