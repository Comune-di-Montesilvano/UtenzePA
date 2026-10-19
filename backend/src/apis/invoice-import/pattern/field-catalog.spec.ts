import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCatalog, rankFor } from './field-catalog';

const fixture = (name: string) => readFileSync(join(__dirname, '../sdi/fixtures', name));

describe('buildCatalog', () => {
  it('aggiunge la variante condizionale dei gruppi con TipoDato (POD)', () => {
    const catalog = buildCatalog(fixture('fattura-pod.xml'));
    expect(catalog).toContainEqual(
      expect.objectContaining({
        scope: 'line',
        path: 'AltriDatiGestionali/RiferimentoTesto',
        where: { path: 'AltriDatiGestionali/TipoDato', equals: 'POD' },
        sample: 'IT001E00000001',
      }),
    );
  });

  it('campi di riga relativi a DettaglioLinee, di testata dal body o dall’header', () => {
    const paths = buildCatalog(fixture('fattura-pod.xml')).map((f) => `${f.scope}|${f.path}`);
    expect(paths).toContain('line|PrezzoTotale');
    expect(paths).toContain('header|DatiGenerali/DatiGeneraliDocumento/Numero');
    expect(paths).toContain(
      'header|FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice',
    );
    expect(paths).not.toContain('header|DatiBeniServizi/DettaglioLinee/PrezzoTotale');
  });

  it('chiavi uniche', () => {
    const catalog = buildCatalog(fixture('fattura-pod.xml'));
    expect(new Set(catalog.map((f) => f.key)).size).toBe(catalog.length);
  });
});

describe('rankFor', () => {
  it('P.IVA: prima quella del cedente, quella del Comune dopo le 11 cifre del cedente', () => {
    const ranked = rankFor('supplierVat', buildCatalog(fixture('fattura-pod.xml'))).map(
      (f) => f.path,
    );
    expect(ranked[0]).toBe(
      'FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice',
    );
    const committente = ranked.indexOf(
      'FatturaElettronicaHeader/CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA/IdCodice',
    );
    const cedenteCf = ranked.indexOf(
      'FatturaElettronicaHeader/CedentePrestatore/DatiAnagrafici/CodiceFiscale',
    );
    expect(committente).toBeGreaterThan(cedenteCf);
  });

  it('utenza ACA: il codice servizio di testata viene per primo', () => {
    const ranked = rankFor('utility', buildCatalog(fixture('fattura-aca.xml')));
    expect(ranked[0]).toEqual(
      expect.objectContaining({ scope: 'header', path: 'DatiGenerali/DatiContratto/IdDocumento' }),
    );
  });

  it('utenza con POD: la variante TipoDato = POD viene per prima', () => {
    const ranked = rankFor('utility', buildCatalog(fixture('fattura-pod.xml')));
    expect(ranked[0].where).toEqual({ path: 'AltriDatiGestionali/TipoDato', equals: 'POD' });
  });

  it('data: prima la data del documento, poi le altre date', () => {
    const ranked = rankFor('date', buildCatalog(fixture('fattura-pod.xml')));
    expect(ranked[0].path).toBe('DatiGenerali/DatiGeneraliDocumento/Data');
    expect(ranked.findIndex((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f.sample ?? ''))).toBeGreaterThan(0);
  });

  it('campi di testata: niente campi di riga', () => {
    const ranked = rankFor('number', buildCatalog(fixture('fattura-pod.xml')));
    expect(ranked.every((f) => f.scope === 'header')).toBe(true);
  });
});
