import {partyName, partyNames} from './party-name.helper';

describe('partyName', () => {
  it('persona fisica: «Cognome Nome»', () => {
    expect(partyName({type: 'NATURAL', last_name: 'Rossi', first_name: 'Maria', company_name: 'X'})).toBe('Rossi Maria');
    expect(partyName({type: 'NATURAL', last_name: 'Rossi'})).toBe('Rossi');
  });

  it('soggetto giuridico: denominazione, altrimenti il nome della persona', () => {
    expect(partyName({type: 'LEGAL', company_name: 'Acme Srl'})).toBe('Acme Srl');
    expect(partyName({type: 'LEGAL', company_name: null, last_name: 'Bianchi', first_name: 'Luca'})).toBe('Bianchi Luca');
  });

  it('nessun soggetto: stringa vuota', () => {
    expect(partyName(null)).toBe('');
    expect(partyName(undefined)).toBe('');
  });
});

describe('partyNames', () => {
  it('unisce i nomi con la virgola e salta quelli vuoti', () => {
    expect(partyNames([{type: 'LEGAL', company_name: 'Acme Srl'}, {type: 'NATURAL'}, {type: 'NATURAL', last_name: 'Rossi'}])).toBe(
      'Acme Srl, Rossi',
    );
  });

  it('lista assente o vuota: stringa vuota', () => {
    expect(partyNames(null)).toBe('');
    expect(partyNames([])).toBe('');
  });
});
