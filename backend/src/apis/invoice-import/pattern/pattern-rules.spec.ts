import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extract,
  patternMatches,
  pickPattern,
  rulePaths,
  structureKey,
  type PatternRules,
} from './pattern-rules';

const fixture = (name: string) => readFileSync(join(__dirname, '../sdi/fixtures', name));
const pod = fixture('fattura-pod.xml');
const aca = fixture('fattura-aca.xml');

const POD_RULES: PatternRules = {
  header: { cig: { kind: 'field', path: 'DatiGenerali/DatiContratto/CodiceCIG' } },
  line: {
    utility: {
      kind: 'field',
      path: 'AltriDatiGestionali/RiferimentoTesto',
      where: { path: 'AltriDatiGestionali/TipoDato', equals: 'POD' },
    },
    periodStart: { kind: 'field', path: 'DataInizioPeriodo' },
    periodEnd: { kind: 'field', path: 'DataFinePeriodo' },
    amount: { kind: 'grossAmount' },
    description: { kind: 'field', path: 'Descrizione' },
    consumption: {
      kind: 'numberAfter',
      path: 'DatiGenerali/DatiGeneraliDocumento/Causale',
      word: 'kWh',
      fromHeader: true,
    },
  },
};

const ACA_RULES: PatternRules = {
  header: {},
  line: {
    utility: { kind: 'fromHeader', path: 'DatiGenerali/DatiContratto/IdDocumento' },
    amount: { kind: 'grossAmount' },
    description: { kind: 'field', path: 'Descrizione' },
    consumption: { kind: 'field', path: 'Quantita' },
    unit: { kind: 'field', path: 'UnitaMisura' },
  },
  consumptionLineFilter: 'Tariffa',
};

const asCreditNote = (xml: Buffer) =>
  Buffer.from(xml.toString('utf8').replace('<TipoDocumento>TD01<', '<TipoDocumento>TD04<'));

describe('extract', () => {
  it('fattura con POD: utenza dalla variante TipoDato, riga senza POD vuota', () => {
    const result = extract(pod, POD_RULES);
    expect(result.lines.map((l) => l.utility)).toEqual(['IT001E00000001', 'IT001E00000001', null]);
    expect(result).toEqual(
      expect.objectContaining({
        supplierVat: '01234567897',
        supplierName: 'Energia Prova S.p.A.',
        number: 'EP 7/26',
        date: '2026-07-10',
        documentType: 'TD01',
        cig: 'AB12345678',
      }),
    );
  });

  it('importo di riga IVA inclusa = PrezzoTotale × (1 + AliquotaIVA/100), arrotondato', () => {
    const result = extract(pod, POD_RULES);
    expect(result.lines.map((l) => l.amount)).toEqual([122, 61, -0.01]);
    expect(result.lines[0]).toEqual(
      expect.objectContaining({ periodStart: '2026-06-01', periodEnd: '2026-06-30' }),
    );
  });

  it('consumo dalla testata (numero dopo la parola): solo sulla prima riga', () => {
    const result = extract(pod, POD_RULES);
    expect(result.lines.map((l) => l.consumption)).toEqual([542, null, null]);
  });

  it('ACA: utenza dalla testata su tutte le righe, consumo solo dalle righe «Tariffa»', () => {
    const result = extract(aca, ACA_RULES);
    expect(result.lines.map((l) => l.utility)).toEqual(['123456', '123456', '123456']);
    expect(result.lines.map((l) => l.consumption)).toEqual([37, null, null]);
    expect(result.lines[0].unit).toBe('Mc');
  });

  it('nota di credito TD04 con importi positivi nell’XML: totale e righe negativi', () => {
    const result = extract(asCreditNote(pod), {
      ...POD_RULES,
      header: {
        ...POD_RULES.header,
        total: { kind: 'field', path: 'DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento' },
      },
    });
    expect(result.documentType).toBe('TD04');
    expect(result.total).toBe(-183);
    // La riga negativa nell'XML (storno dentro la nota) torna positiva: la somma resta il totale.
    expect(result.lines.map((l) => l.amount)).toEqual([-122, -61, 0.01]);
    // Una nota di credito non registra consumi (i conguagli sono un caso a parte).
    expect(result.lines.every((l) => l.consumption === null)).toBe(true);
  });

  it('nota di credito TD04 con importi già negativi nell’XML: segni lasciati come sono', () => {
    const negative = Buffer.from(
      asCreditNote(pod)
        .toString('utf8')
        .replace('<ImportoTotaleDocumento>183.00<', '<ImportoTotaleDocumento>-183.00<')
        .replace('<PrezzoTotale>100.00<', '<PrezzoTotale>-100.00<')
        .replace('<PrezzoTotale>50.00<', '<PrezzoTotale>-50.00<')
        .replace('<PrezzoTotale>-0.01<', '<PrezzoTotale>0.01<')
        .replace('<ImponibileImporto>150.00<', '<ImponibileImporto>-150.00<'),
    );
    const result = extract(negative, {
      ...POD_RULES,
      header: {
        total: { kind: 'field', path: 'DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento' },
        netAmount: { kind: 'field', path: 'DatiBeniServizi/DatiRiepilogo/ImponibileImporto' },
      },
    });
    expect(result.total).toBe(-183);
    expect(result.netAmount).toBe(-150);
    expect(result.lines.map((l) => l.amount)).toEqual([-122, -61, 0.01]);
  });

  it('imponibile con più aliquote: somma dei DatiRiepilogo', () => {
    const twoRates = Buffer.from(
      pod
        .toString('utf8')
        .replace(
          '</DatiBeniServizi>',
          '<DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N1</Natura><ImponibileImporto>-0.01</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo></DatiBeniServizi>',
        ),
    );
    const result = extract(twoRates, {
      ...POD_RULES,
      header: { netAmount: { kind: 'field', path: 'DatiBeniServizi/DatiRiepilogo/ImponibileImporto' } },
    });
    expect(result.netAmount).toBe(149.99);
  });

  it('nota di credito semplificata TD08: importi negativi come la TD04', () => {
    const td08 = Buffer.from(pod.toString('utf8').replace('<TipoDocumento>TD01<', '<TipoDocumento>TD08<'));
    expect(extract(td08, POD_RULES).lines[0].amount).toBe(-122);
  });

  it('numero dopo la parola con virgola decimale e migliaia all’italiana', () => {
    const xml = Buffer.from(pod.toString('utf8').replace('kWh 542 periodo', 'kWh 1.234,5 periodo'));
    expect(extract(xml, POD_RULES).lines[0].consumption).toBe(1234.5);
  });
});

describe('extract: dati nella Causale (A2A)', () => {
  const A2A_RULES: PatternRules = {
    header: {},
    line: {
      ...POD_RULES.line,
      consumption: {
        kind: 'numberAfter',
        path: 'DatiGenerali/DatiGeneraliDocumento/Causale',
        word: 'kWh',
        fromHeader: true,
      },
      meter: {
        kind: 'textAfter',
        path: 'DatiGenerali/DatiGeneraliDocumento/Causale',
        word: 'Contatore',
        fromHeader: true,
      },
    },
  };
  const withCausale = (causali: string[], xml = pod) =>
    Buffer.from(
      xml
        .toString('utf8')
        .replace(
          '<Causale>Consumo fatturato kWh 542 periodo giugno</Causale>',
          causali.map((c) => `<Causale>${c}</Causale>`).join(''),
        ),
    );
  const A2A_CAUSALE =
    'FORNITURA ENERGIA ELETTRICA periodo: 01.06.2026-30.06.2026  POD IT001E00000001 Contatore 000000000000283767 kWh 542';

  it('consumo, unità e matricola dalla Causale: zeri iniziali conservati', () => {
    const result = extract(withCausale([A2A_CAUSALE]), A2A_RULES);
    expect(result.lines[0]).toEqual(
      expect.objectContaining({ consumption: 542, unit: 'kWh', meter: '000000000000283767' }),
    );
    // Consumo una volta sola per utenza, matricola su tutte le sue righe.
    expect(result.lines[1].consumption).toBeNull();
    expect(result.lines[1].meter).toBe('000000000000283767');
  });

  it('matricola alfanumerica', () => {
    const xml = withCausale([A2A_CAUSALE.replace('000000000000283767', '0000E12345678')]);
    expect(extract(xml, A2A_RULES).lines[0].meter).toBe('0000E12345678');
  });

  it('Causale spezzata in più elementi (200 caratteri l’uno), anche a metà parola', () => {
    const at = A2A_CAUSALE.indexOf('283767');
    const xml = withCausale([A2A_CAUSALE.slice(0, at), A2A_CAUSALE.slice(at)]);
    expect(extract(xml, A2A_RULES).lines[0]).toEqual(
      expect.objectContaining({ consumption: 542, meter: '000000000000283767' }),
    );
  });

  it('più POD nella Causale: ogni riga legge il tratto della sua utenza', () => {
    const two = Buffer.from(
      withCausale([
        'POD IT001E00000001 Contatore 111 kWh 10 POD IT001E00000002 Contatore 222 kWh 20',
      ])
        .toString('utf8')
        .replace(/(<NumeroLinea>2<\/NumeroLinea>[\s\S]*?)IT001E00000001/, '$1IT001E00000002'),
    );
    const lines = extract(two, A2A_RULES).lines;
    expect(lines.slice(0, 2).map((l) => [l.utility, l.consumption, l.meter])).toEqual([
      ['IT001E00000001', 10, '111'],
      ['IT001E00000002', 20, '222'],
    ]);
  });

  it('unità mappata: vale quella, non la parola', () => {
    const rules: PatternRules = {
      ...A2A_RULES,
      line: { ...A2A_RULES.line, unit: { kind: 'none' } },
    };
    expect(extract(withCausale([A2A_CAUSALE]), rules).lines[0].unit).toBeNull();
  });
});

describe('patternMatches e pickPattern', () => {
  it('falso se manca un percorso usato dalle regole', () => {
    expect(patternMatches(pod, POD_RULES)).toBe(true);
    expect(patternMatches(aca, POD_RULES)).toBe(false);
  });

  it('variante con un TipoDato assente: non combacia', () => {
    const rules: PatternRules = {
      header: {},
      line: {
        ...POD_RULES.line,
        utility: {
          kind: 'field',
          path: 'AltriDatiGestionali/RiferimentoTesto',
          where: { path: 'AltriDatiGestionali/TipoDato', equals: 'PDR' },
        },
      },
    };
    expect(patternMatches(pod, rules)).toBe(false);
  });

  it('sceglie il pattern più specifico, null a parità', () => {
    const generic: PatternRules = {
      header: {},
      line: { amount: { kind: 'field', path: 'PrezzoTotale' } },
    };
    const a = { id: 1, rules: generic, paths_count: rulePaths(generic).length };
    const b = { id: 2, rules: POD_RULES, paths_count: rulePaths(POD_RULES).length };
    expect(pickPattern(pod, [a, b])?.id).toBe(2);
    expect(pickPattern(pod, [a, { ...a, id: 3 }])).toBeNull();
    expect(pickPattern(aca, [b])).toBeNull();
  });
});

describe('structureKey', () => {
  it('uguale con valori diversi e stessa struttura, diversa se cambia un percorso', () => {
    const otherValues = Buffer.from(
      pod.toString('utf8').replace('EP 7/26', 'EP 8/26').replace('100.00', '90.00'),
    );
    expect(structureKey(otherValues)).toBe(structureKey(pod));
    expect(structureKey(pod)).toMatch(/^[0-9a-f]{40}$/);
    const otherPath = Buffer.from(pod.toString('utf8').replace('<Natura>N1</Natura>', ''));
    expect(structureKey(otherPath)).not.toBe(structureKey(pod));
  });
});
