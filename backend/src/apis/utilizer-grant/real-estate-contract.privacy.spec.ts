import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';
import { maskAssetGrants, maskContract, maskUtility } from './real-estate-contract.privacy';

const grant = () => ({
  id: 1,
  parties: [
    {
      id: 2,
      type: ThirdPartyType.NATURAL,
      last_name: 'Rossi',
      first_name: 'Mario',
      tax_code: 'RSSMRA80A01H501U',
      phone: '333',
    },
    { id: 3, type: ThirdPartyType.LEGAL, company_name: 'ACA', tax_code: '91015370686', phone: '085' },
  ],
});

describe('privacy contratti: parti persone fisiche', () => {
  it('Admin e Operatore vedono CF e telefono', () => {
    expect(maskContract(grant(), 'Admin').parties[0].tax_code).toBe('RSSMRA80A01H501U');
    expect(maskContract(grant(), 'Operatore').parties[0].phone).toBe('333');
  });

  it('Lettore: CF e telefono delle persone nascosti, il resto invariato', () => {
    const [person, legal] = maskContract(grant(), 'Lettore').parties;
    expect(person).toEqual({
      id: 2,
      type: ThirdPartyType.NATURAL,
      last_name: 'Rossi',
      first_name: 'Mario',
      tax_code: null,
      phone: null,
    });
    expect(legal.tax_code).toBe('91015370686');
  });

  it('ruolo assente trattato come Lettore', () => {
    expect(maskContract(grant(), undefined).parties[0].tax_code).toBeNull();
  });

  it('contratti annidati in immobili e utenze', () => {
    const asset = { id: 9, utilizerGrants: [grant()] };
    expect(maskAssetGrants(asset, 'Lettore').utilizerGrants[0].parties[0].tax_code).toBeNull();
    const utility = { id: 1, assets: [{ id: 9, utilizerGrants: [grant()] }] };
    expect(
      maskUtility(utility, 'Lettore').assets[0].utilizerGrants[0].parties[0].phone,
    ).toBeNull();
  });

  it('utenze: anche il fornitore (corrente e dei contratti) persona fisica', () => {
    const person = () => ({ type: ThirdPartyType.NATURAL, tax_code: 'RSSMRA80A01H501U', phone: '333' });
    const utility = { id: 1, supplier: person(), contratti: [{ id: 5, supplier: person() }] };
    const masked = maskUtility(utility, 'Lettore');
    expect(masked.supplier.tax_code).toBeNull();
    expect(masked.contratti[0].supplier.phone).toBeNull();
    expect(maskUtility(utility, 'Admin').supplier.tax_code).toBe('RSSMRA80A01H501U');
  });

  it('non modifica l’oggetto originale', () => {
    const g = grant();
    maskContract(g, 'Lettore');
    expect(g.parties[0].tax_code).toBe('RSSMRA80A01H501U');
  });
});
