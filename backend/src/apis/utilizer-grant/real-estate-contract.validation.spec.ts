import { validateContract } from './real-estate-contract.validation';
import { RentPeriod } from './enum/real-estate-contract.enum';

const ok = {
  id: 10,
  start_date: null,
  end_date: null,
  rent_amount: null,
  rent_period: null,
  tacit_renewal: false,
  renewal_months: null,
  notice_months: null,
  parent_contract_id: null,
  parentHasParent: false,
};

describe('validateContract', () => {
  it('accetta un contratto Access senza canone né date', () => {
    expect(validateContract(ok)).toBeNull();
  });

  it('canone e periodicità vanno in coppia', () => {
    expect(validateContract({ ...ok, rent_amount: 100 })).toMatch(/periodicità/);
    expect(validateContract({ ...ok, rent_period: RentPeriod.MONTHLY })).toMatch(/canone/);
  });

  it('rinnovo tacito richiede scadenza, durata rinnovo e preavviso', () => {
    expect(validateContract({ ...ok, tacit_renewal: true })).toMatch(/scadenza/);
    expect(
      validateContract({ ...ok, tacit_renewal: true, end_date: '2027-01-01', notice_months: 3 }),
    ).toMatch(/durata/);
    expect(
      validateContract({ ...ok, tacit_renewal: true, end_date: '2027-01-01', renewal_months: 48 }),
    ).toMatch(/preavviso/);
  });

  it('scadenza non precedente alla decorrenza', () => {
    expect(validateContract({ ...ok, start_date: '2026-01-02', end_date: '2026-01-01' })).toMatch(
      /decorrenza/,
    );
  });

  it('padre: non sé stesso, un solo livello', () => {
    expect(validateContract({ ...ok, parent_contract_id: 10 })).toMatch(/sé stesso/);
    expect(validateContract({ ...ok, parent_contract_id: 5, parentHasParent: true })).toMatch(
      /livello/,
    );
  });
});
