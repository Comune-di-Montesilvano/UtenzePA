import { draftError, NOT_DRAFT_SQL } from './contract-draft';

describe('contract-draft', () => {
  const dates = { supply_start_date: '2027-01-01', supply_expiry_date: '2027-12-31' };
  const datesMsg = 'Una bozza deve avere le date di fornitura previste (inizio e scadenza).';

  it('ammette un contratto non in bozza senza date', () => {
    expect(draftError({ draft: false })).toBeNull();
  });

  it('ammette una bozza con le due date', () => {
    expect(draftError({ draft: true, ...dates })).toBeNull();
  });

  it('chiede le date alla bozza', () => {
    expect(draftError({ draft: true, supply_start_date: '2027-01-01' })).toBe(datesMsg);
    expect(draftError({ draft: true })).toBe(datesMsg);
  });

  it('rifiuta una bozza chiusa', () => {
    expect(draftError({ draft: true, closed: true, ...dates })).toBe(
      'Una bozza non può essere chiusa: eliminala oppure togli la spunta Bozza.',
    );
  });

  it('rifiuta il ritorno in bozza', () => {
    expect(draftError({ draft: true, ...dates }, { draft: false })).toBe(
      'Un contratto già emesso non può tornare in bozza.',
    );
  });

  it('ammette la promozione', () => {
    expect(draftError({ draft: false, ...dates }, { draft: true })).toBeNull();
  });

  it("NOT_DRAFT_SQL usa l'alias", () => {
    expect(NOT_DRAFT_SQL('c')).toBe('c.draft = 0');
  });
});
