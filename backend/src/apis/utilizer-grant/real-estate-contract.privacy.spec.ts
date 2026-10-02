import {
  maskAssetGrants,
  maskContract,
  maskUtility,
  maskUtilizer,
} from './real-estate-contract.privacy';

const grant = () => ({
  id: 1,
  utilizer: { id: 2, name: 'Mario Rossi', tax_code: 'RSSMRA80A01H501U', contacts: '333' },
});

describe('privacy contratti: codice fiscale', () => {
  it('Admin e Operatore vedono il codice fiscale', () => {
    expect(maskContract(grant(), 'Admin').utilizer.tax_code).toBe('RSSMRA80A01H501U');
    expect(maskContract(grant(), 'Operatore').utilizer.tax_code).toBe('RSSMRA80A01H501U');
  });

  it('Lettore: solo il codice fiscale è nascosto', () => {
    expect(maskContract(grant(), 'Lettore').utilizer).toEqual({
      id: 2,
      name: 'Mario Rossi',
      tax_code: null,
      contacts: '333',
    });
  });

  it('ruolo assente trattato come Lettore', () => {
    expect(maskContract(grant(), undefined).utilizer.tax_code).toBeNull();
  });

  it('contratti annidati in immobili e utenze', () => {
    const asset = { id: 9, utilizerGrants: [grant()] };
    expect(maskAssetGrants(asset, 'Lettore').utilizerGrants[0].utilizer.tax_code).toBeNull();
    const utility = { id: 1, assets: [{ id: 9, utilizerGrants: [grant()] }] };
    expect(
      maskUtility(utility, 'Lettore').assets[0].utilizerGrants[0].utilizer.tax_code,
    ).toBeNull();
  });

  it('anagrafica controparte', () => {
    expect(maskUtilizer({ id: 2, name: 'X', tax_code: 'A', contacts: 'B' }, 'Lettore')).toEqual({
      id: 2,
      name: 'X',
      tax_code: null,
      contacts: 'B',
    });
  });

  it('non modifica l’oggetto originale', () => {
    const g = grant();
    maskContract(g, 'Lettore');
    expect(g.utilizer.tax_code).toBe('RSSMRA80A01H501U');
  });
});
