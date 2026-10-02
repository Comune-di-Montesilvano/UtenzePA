import { ContractDirection, ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole, ThirdPartyType } from './enum/third-party.enum';
import { partyName, partyNameSql } from './third-party.name';
import { normalizeParty, touchesIdentity, validateThirdParty } from './third-party.validation';
import { matchesRoles, partyRoles, RoleIndex } from './third-party.roles';
import { maskParty, maskSupplierOf } from './third-party.privacy';

const LEGAL = ThirdPartyType.LEGAL;
const NATURAL = ThirdPartyType.NATURAL;

describe('partyName', () => {
  it('giuridica: denominazione', () => {
    expect(partyName({ type: LEGAL, company_name: 'ACA SpA' })).toBe('ACA SpA');
  });
  it('fisica: cognome nome', () => {
    expect(partyName({ type: NATURAL, last_name: 'Rossi', first_name: 'Mario' })).toBe(
      'Rossi Mario',
    );
  });
  it('vuoto se nullo', () => {
    expect(partyName(null)).toBe('');
  });
  it('SQL con CASE sul tipo', () => {
    expect(partyNameSql('tp')).toContain("tp.type = 'NATURAL'");
  });
});

describe('normalizeParty', () => {
  it('P.IVA/CF maiuscoli senza spazi, stringhe vuote a null, nomi ripuliti', () => {
    expect(
      normalizeParty({
        vat_number: ' 012 3456 7890 ',
        tax_code: 'rss mra80a01h501u',
        company_name: '  ACA ',
        last_name: '',
      }),
    ).toEqual({
      vat_number: '01234567890',
      tax_code: 'RSSMRA80A01H501U',
      company_name: 'ACA',
      last_name: null,
    });
  });
  it('non aggiunge campi assenti', () => {
    expect(normalizeParty({ phone: '333' } as never)).toEqual({ phone: '333' });
  });
});

describe('touchesIdentity', () => {
  it('restore senza campi identità', () => {
    expect(touchesIdentity({ deleted: false, updated_by_user_id: 1 })).toBe(false);
  });
  it('salvataggio scheda', () => {
    expect(touchesIdentity({ type: LEGAL, notes: 'x' })).toBe(true);
  });
});

describe('validateThirdParty', () => {
  const legal = { type: LEGAL, company_name: 'ACA', vat_number: '01318460688' };
  const person = {
    type: NATURAL,
    last_name: 'Rossi',
    first_name: 'Mario',
    tax_code: 'RSSMRA80A01H501U',
  };

  it('validi', () => {
    expect(validateThirdParty(legal)).toBeNull();
    expect(validateThirdParty(person)).toBeNull();
    expect(validateThirdParty({ ...legal, tax_code: '91015370686' })).toBeNull();
  });
  it('tipo obbligatorio', () => {
    expect(validateThirdParty({ company_name: 'X' })).toMatch(/fisica o giuridica/);
  });
  it('giuridica senza P.IVA o denominazione', () => {
    expect(validateThirdParty({ ...legal, vat_number: null })).toMatch(/Partita IVA obbligatoria/);
    expect(validateThirdParty({ ...legal, company_name: null })).toMatch(/Denominazione/);
  });
  it('formati', () => {
    expect(validateThirdParty({ ...legal, vat_number: '1219980529' })).toMatch(/11 cifre/);
    expect(validateThirdParty({ ...person, tax_code: 'RSSMRA80' })).toMatch(/16 caratteri/);
    expect(validateThirdParty({ ...person, vat_number: '123' })).toMatch(/11 cifre/);
  });
  it('fisica senza CF o nomi', () => {
    expect(validateThirdParty({ ...person, tax_code: null })).toMatch(
      /Codice fiscale obbligatorio/,
    );
    expect(validateThirdParty({ ...person, first_name: null })).toMatch(/Cognome e nome/);
  });
});

describe('ruoli', () => {
  const index: RoleIndex = {
    suppliers: new Set([42]),
    grants: [
      { party_id: 1000, direction: ContractDirection.PASSIVE, kind: ContractKind.LEASE },
      { party_id: 1001, direction: ContractDirection.ACTIVE, kind: ContractKind.CONCESSION },
      { party_id: 42, direction: ContractDirection.ACTIVE, kind: ContractKind.LEASE },
    ],
  };

  it('derivati dai collegamenti', () => {
    expect(partyRoles(42, index)).toEqual([PartyRole.SUPPLIER, PartyRole.TENANT]);
    expect(partyRoles(1000, index)).toEqual([PartyRole.LESSOR]);
    expect(partyRoles(9, index)).toEqual([]);
  });
  it('limitati a un tipo di contratto', () => {
    expect(partyRoles(1001, index, ContractKind.LEASE)).toEqual([]);
    expect(partyRoles(42, index, ContractKind.LEASE)).toEqual([
      PartyRole.SUPPLIER,
      PartyRole.TENANT,
    ]);
  });
  it('filtro chip in OR, "senza collegamenti" = nessun ruolo', () => {
    expect(matchesRoles([PartyRole.LESSOR], [])).toBe(true);
    expect(matchesRoles([PartyRole.LESSOR], [PartyRole.SUPPLIER, PartyRole.LESSOR])).toBe(true);
    expect(matchesRoles([PartyRole.TENANT], [PartyRole.SUPPLIER])).toBe(false);
    expect(matchesRoles([], [PartyRole.UNLINKED])).toBe(true);
    expect(matchesRoles([PartyRole.SUPPLIER], [PartyRole.UNLINKED])).toBe(false);
  });
});

describe('maskParty', () => {
  const person = { type: NATURAL, tax_code: 'RSSMRA80A01H501U', phone: '333' };
  it('Lettore: CF e telefono delle persone oscurati', () => {
    expect(maskParty(person, 'Lettore')).toEqual({ type: NATURAL, tax_code: null, phone: null });
    expect(maskParty(person, undefined).tax_code).toBeNull();
  });
  it('Admin/Operatore: invariato', () => {
    expect(maskParty(person, 'Operatore')).toBe(person);
  });
  it('giuridica: invariata anche per il Lettore', () => {
    const legal = { type: LEGAL, tax_code: '91015370686', phone: '085' };
    expect(maskParty(legal, 'Lettore')).toBe(legal);
  });
});

describe('maskSupplierOf', () => {
  const contract = () => ({
    id: 1,
    supplier: { type: NATURAL, last_name: 'Rossi', tax_code: 'RSSMRA80A01H501U', phone: '333' },
  });
  it('fornitore persona fisica oscurato per il Lettore', () => {
    expect(maskSupplierOf(contract(), 'Lettore').supplier).toEqual({
      type: NATURAL,
      last_name: 'Rossi',
      tax_code: null,
      phone: null,
    });
  });
  it('Operatore e oggetti senza fornitore invariati', () => {
    const c = contract();
    expect(maskSupplierOf(c, 'Operatore')).toBe(c);
    expect(maskSupplierOf({ id: 2, supplier: null }, 'Lettore').supplier).toBeNull();
  });
});
