import { readFileSync } from 'fs';
import { join } from 'path';
import { extractP7m } from './p7m';
import { extractPdf, parseInvoiceHeader, parseNotification, sdiFileKind } from './sdi-files';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name));

describe('extractP7m', () => {
  it('estrae il contenuto firmato da una busta DER', () => {
    expect(extractP7m(fixture('fattura-firmata.xml.p7m')).equals(fixture('fattura.xml'))).toBe(
      true,
    );
  });

  it('estrae il contenuto firmato da una busta in base64', () => {
    expect(extractP7m(fixture('fattura-firmata-b64.xml.p7m')).equals(fixture('fattura.xml'))).toBe(
      true,
    );
  });

  it('rifiuta una busta illeggibile', () => {
    expect(() => extractP7m(Buffer.from('xx'))).toThrow('p7m illeggibile');
  });
});

describe('sdiFileKind', () => {
  it.each([
    ['IT01234567897_a1B2c.xml', 'INVOICE'],
    ['IT01234567897_a1B2c.xml.p7m', 'INVOICE'],
    ['IT01234567897_a1B2c_EC_001.xml', 'EC'],
    ['IT01234567897_a1B2c_MT_001.xml', 'MT'],
    ['IT01234567897_a1B2c_DT_001.xml', 'DT'],
    ['IT01234567897_a1B2c_SE_001.xml', 'SE'],
    ['IT01234567897_a1B2c_RC_001.xml', 'OTHER'],
    ['daticert.xml', 'OTHER'],
  ])('%s → %s', (name, kind) => {
    expect(sdiFileKind(name)).toBe(kind);
  });
});

describe('parseInvoiceHeader', () => {
  it('legge cedente e dati generali del documento', () => {
    expect(parseInvoiceHeader(fixture('fattura.xml'))).toEqual({
      supplierVat: '01234567897',
      supplierName: 'Fornitore Prova S.p.A.',
      documents: [{ type: 'TD01', number: 'FPR 1/26', date: '2026-07-10', total: 122 }],
    });
  });

  it('ignora foglio di stile e BOM in testa al file', () => {
    const xml = fixture('fattura.xml')
      .toString('utf8')
      .replace('?>', '?>\n<?xml-stylesheet type="text/xsl" href="fatturapa.xsl"?>');
    expect(parseInvoiceHeader(Buffer.from('﻿' + xml)).supplierVat).toBe('01234567897');
  });

  it('un documento per ogni FatturaElettronicaBody', () => {
    const xml = fixture('fattura.xml').toString('utf8');
    const body = xml.slice(
      xml.indexOf('<FatturaElettronicaBody>'),
      xml.indexOf('</FatturaElettronicaBody>') + '</FatturaElettronicaBody>'.length,
    );
    const lotto = xml.replace(body, body + body.replace('FPR 1/26', 'FPR 2/26'));
    expect(parseInvoiceHeader(Buffer.from(lotto)).documents.map((d) => d.number)).toEqual([
      'FPR 1/26',
      'FPR 2/26',
    ]);
  });
});

describe('parseNotification', () => {
  it('esito committente EC01', () => {
    expect(parseNotification(fixture('ec01.xml'))).toEqual({
      sdiIdentifier: '99000000001',
      outcome: 'EC01',
      invoiceFileName: null,
    });
  });

  it('esito committente EC02', () => {
    expect(parseNotification(fixture('ec02.xml')).outcome).toBe('EC02');
  });

  it('metadati con il nome del file fattura', () => {
    expect(parseNotification(fixture('mt.xml'))).toEqual({
      sdiIdentifier: '99000000001',
      outcome: null,
      invoiceFileName: 'IT01234567897_a1B2c.xml.p7m',
    });
  });

  it('decorrenza termini senza esito', () => {
    expect(parseNotification(fixture('dt.xml')).outcome).toBeNull();
  });
});

describe('extractPdf', () => {
  it('decodifica il PDF allegato', () => {
    const pdf = extractPdf(fixture('fattura.xml'));
    expect(pdf?.name).toBe('fattura-prova.pdf');
    expect(pdf?.data.equals(fixture('documento.pdf'))).toBe(true);
  });

  it('null senza allegati', () => {
    const xml = fixture('fattura.xml')
      .toString('utf8')
      .replace(/<Allegati>[\s\S]*<\/Allegati>/, '');
    expect(extractPdf(Buffer.from(xml))).toBeNull();
  });
});
