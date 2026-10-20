import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extract,
  fromAnchor,
  numberBefore,
  patternMatches,
  PDF_PATH,
  pickPattern,
  isCreditNote,
  documentTypeOf,
  rulePaths,
  structureKey,
  usesPdf,
  wordOccurrences,
  type PatternRules,
  type WordRule,
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
      header: {
        netAmount: { kind: 'field', path: 'DatiBeniServizi/DatiRiepilogo/ImponibileImporto' },
      },
    });
    expect(result.netAmount).toBe(149.99);
  });

  it('nota di credito semplificata TD08: importi negativi come la TD04', () => {
    const td08 = Buffer.from(
      pod.toString('utf8').replace('<TipoDocumento>TD01<', '<TipoDocumento>TD08<'),
    );
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

  it('più POD nel testo: il tratto di un’utenza finisce dove comincia la successiva', () => {
    const two = Buffer.from(
      withCausale(['POD IT001E00000001 Contatore 111 POD IT001E00000002 Contatore 222 kWh 20'])
        .toString('utf8')
        .replace(/(<NumeroLinea>2<\/NumeroLinea>[\s\S]*?)IT001E00000001/, '$1IT001E00000002'),
    );
    const lines = extract(two, A2A_RULES).lines;
    // Senza kWh nel suo tratto la prima utenza non prende il consumo della seconda.
    expect(lines.slice(0, 2).map((l) => [l.consumption, l.meter])).toEqual([
      [null, '111'],
      [20, '222'],
    ]);
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

  it('data da un campo di testo intero: la data che contiene, o nessuna', () => {
    const causale = 'DatiGenerali/DatiGeneraliDocumento/Causale';
    const r: PatternRules = {
      header: {},
      line: {
        ...A2A_RULES.line,
        periodStart: { kind: 'fromHeader', path: causale },
        periodEnd: { kind: 'fromHeader', path: causale },
      },
    };
    const line = extract(withCausale(['FORNITURA periodo: 01.09.2026-30.09.2026 POD X']), r)
      .lines[0];
    expect([line.periodStart, line.periodEnd]).toEqual(['2026-09-01', '2026-09-30']);
    const none = extract(withCausale(['FORNITURA ENERGIA ELETTRICA']), r).lines[0];
    expect([none.periodStart, none.periodEnd]).toEqual([null, null]);
  });
});

describe('extract: dati nel PDF allegato', () => {
  const fromPdf = (r: Omit<WordRule, 'path' | 'fromHeader'>): WordRule => ({
    ...r,
    path: PDF_PATH,
    fromHeader: true,
  });
  const rules = (line: PatternRules['line']): PatternRules => ({
    header: {},
    line: { ...ACA_RULES.line, consumption: undefined, unit: undefined, ...line },
  });
  // Testo come lo restituisce pdfjs: righe spezzate, numeri all'italiana.
  const PDF = [
    'Codice Servizio 123456',
    'Contatore n. 98765',
    'Consumo annuo: 28.908 kWh',
    'Sintesi consumi fatturati',
    'F1 (kWh)   F2 (kWh)   Totale',
    '137,000   954,000   1.091,000 kWh',
    'Consumo nel periodo di 39 giorni',
    '594 mc',
    'Gas prelevato   18,344 Smc',
  ].join('\n');

  it('numero prima della parola dall’ancora in poi; unità = la parola', () => {
    const r = rules({
      consumption: fromPdf({ kind: 'numberBefore', word: 'kWh', anchor: 'Sintesi consumi' }),
    });
    const line = extract(aca, r, PDF).lines[0];
    expect(line).toEqual(expect.objectContaining({ consumption: 1091, unit: 'kWh' }));
  });

  it('numero dopo la parola: unità scritta dopo il numero', () => {
    const r = rules({ consumption: fromPdf({ kind: 'numberAfter', word: 'Gas prelevato' }) });
    expect(extract(aca, r, PDF).lines[0]).toEqual(
      expect.objectContaining({ consumption: 18.344, unit: 'Smc' }),
    );
  });

  it('matricola dal PDF su tutte le righe; consumo una volta sola', () => {
    const r = rules({
      consumption: fromPdf({ kind: 'numberBefore', word: 'mc', anchor: 'Consumo nel periodo' }),
      meter: fromPdf({ kind: 'textAfter', word: 'Contatore n.' }),
    });
    const lines = extract(aca, r, PDF).lines;
    expect(lines.map((l) => l.meter)).toEqual(['98765', '98765', '98765']);
    expect(lines.map((l) => l.consumption)).toEqual([594, null, null]);
  });

  it('senza PDF o senza ancora nel testo: nessun dato', () => {
    const r = rules({
      consumption: fromPdf({ kind: 'numberBefore', word: 'kWh', anchor: 'Riepilogo' }),
      meter: fromPdf({ kind: 'textAfter', word: 'Contatore n.' }),
    });
    expect(extract(aca, r, PDF).lines[0].consumption).toBeNull();
    expect(extract(aca, r).lines[0]).toEqual(
      expect.objectContaining({ consumption: null, meter: null }),
    );
  });

  it('una sola utenza, citata dopo il dato: si legge tutto il testo', () => {
    const r = rules({ consumption: fromPdf({ kind: 'numberAfter', word: 'Consumo totale' }) });
    const text = 'Consumo totale fatturato: 9,5 Smc\nCodice Servizio 123456';
    expect(extract(aca, r, text).lines[0].consumption).toBe(9.5);
  });

  it('consumo stimato: parola presente nel tratto, oppure «di cui stimati» maggiore di zero', () => {
    const consumption = fromPdf({
      kind: 'numberBefore',
      word: 'mc',
      anchor: 'Consumo nel periodo',
    });
    const word = rules({
      consumption,
      estimated: fromPdf({ kind: 'contains', word: 'Stimata', anchor: 'Contatore n.' }),
    });
    const withReadings = PDF.replace(
      'Contatore n. 98765',
      'Contatore n. 98765\n29/06/2026 99369 mc Stimata',
    );
    expect(extract(aca, word, withReadings).lines.map((l) => l.estimated)).toEqual([
      true,
      false,
      false,
    ]);
    expect(extract(aca, word, PDF).lines[0].estimated).toBe(false);

    const share = rules({
      consumption,
      estimated: fromPdf({ kind: 'numberAfter', word: 'di cui stimati' }),
    });
    expect(extract(aca, share, `${PDF}\ndi cui stimati: 13 Smc`).lines[0].estimated).toBe(true);
    expect(extract(aca, share, `${PDF}\ndi cui stimati: 0 Smc`).lines[0].estimated).toBe(false);
  });

  it('parola ripetuta: occorrenza scelta, e l’elenco delle occorrenze col valore di ciascuna', () => {
    const text = 'Consumo annuo 1.200 kWh\nConsumo del periodo 98 kWh\nConsumo medio 3 kWh';
    const r = rules({
      consumption: fromPdf({ kind: 'numberAfter', word: 'Consumo', occurrence: 2 }),
    });
    expect(extract(aca, r, text).lines[0]).toEqual(
      expect.objectContaining({ consumption: 98, unit: 'kWh' }),
    );
    expect(wordOccurrences(aca, r, 'consumption', text).map((o) => [o.n, o.value])).toEqual([
      [1, '1200'],
      [2, '98'],
      [3, '3'],
    ]);
    expect(wordOccurrences(aca, r, 'consumption', text)[1].context).toContain(
      'Consumo del periodo 98',
    );
    const before = rules({
      consumption: fromPdf({ kind: 'numberBefore', word: 'kWh', occurrence: 3 }),
    });
    expect(extract(aca, before, text).lines[0].consumption).toBe(3);
    const beyond = rules({
      consumption: fromPdf({ kind: 'numberAfter', word: 'Consumo', occurrence: 4 }),
    });
    expect(extract(aca, beyond, text).lines[0].consumption).toBeNull();
  });

  it('dal PDF anche testata, date (due in un testo) e testo prima della parola', () => {
    const text = 'Bolletta n. 77 del 16/10/2026\nperiodo: 01.09.2026-30.09.2026\n283767 Matricola';
    const r: PatternRules = {
      header: {
        number: { kind: 'textAfter', path: PDF_PATH, word: 'Bolletta n.' },
        date: { kind: 'textAfter', path: PDF_PATH, word: 'del' },
      },
      line: {
        ...rules({}).line,
        periodStart: fromPdf({ kind: 'textAfter', word: 'periodo:' }),
        periodEnd: fromPdf({ kind: 'textAfter', word: 'periodo:' }),
        meter: fromPdf({ kind: 'textBefore', word: 'Matricola' }),
      },
    };
    const extracted = extract(aca, r, text);
    expect(extracted).toEqual(expect.objectContaining({ number: '77', date: '2026-10-16' }));
    expect(extracted.lines[0]).toEqual(
      expect.objectContaining({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        meter: '283767',
      }),
    );
    expect(wordOccurrences(aca, r, 'date', text)).toEqual([
      {
        n: 1,
        context: 'Bolletta n. 77 del 16/10/2026 periodo: 01.09.2026-30.09.2026 283767',
        value: '16/10/2026',
      },
    ]);
  });

  it('descrizione senza regola: quella della riga; «non presente»: nessuna', () => {
    const base = rules({ description: undefined });
    expect(extract(aca, base).lines[0].description).toBeTruthy();
    expect(extract(aca, rules({ description: { kind: 'none' } })).lines[0].description).toBeNull();
  });

  it('periodo dal PDF: data dopo il testo e ultima data prima del testo', () => {
    const text = [
      'Data Lettura Tipo lettura',
      '29/06/2026 99369 mc Stimata',
      '07/08/2026 99963 mc Stimata',
      'Consumo nel periodo di 39 giorni 594 mc',
    ].join('\n');
    const r = rules({
      periodStart: fromPdf({ kind: 'textAfter', word: 'Tipo lettura' }),
      periodEnd: fromPdf({ kind: 'textBefore', word: 'Consumo nel periodo' }),
    });
    expect(extract(aca, r, text).lines[0]).toEqual(
      expect.objectContaining({ periodStart: '2026-06-29', periodEnd: '2026-08-07' }),
    );
  });

  it('consumo per fasce dal PDF: ogni fascia col suo testo, totale = somma', () => {
    const text = [
      'Tipo di Consumo',
      '31.08.2026 30.09.2026 Fascia oraria F1 4.007 Rilevata 4.067 Rilevata 60 kWh Effettivo',
      '31.08.2026 30.09.2026 Fascia oraria F2 1.066 Rilevata 1.091 Rilevata 25 kWh Effettivo',
      '31.08.2026 30.09.2026 Fascia oraria F3 1.629 Rilevata 1.667 Rilevata 38 kWh Effettivo',
    ].join('\n');
    const band = (n: number) =>
      fromPdf({ kind: 'numberBefore', word: 'kWh', anchor: `Fascia oraria F${n}` });
    const r = rules({ consumptionF1: band(1), consumptionF2: band(2), consumptionF3: band(3) });
    expect(extract(aca, r, text).lines[0]).toEqual(
      expect.objectContaining({
        consumption: 123,
        consumptionF1: 60,
        consumptionF2: 25,
        consumptionF3: 38,
        unit: 'kWh',
      }),
    );
    // Col totale letto restano tutti e due: il totale non è ricalcolato.
    const withTotal = rules({
      consumption: fromPdf({ kind: 'numberAfter', word: 'Consumo' }),
      consumptionF1: band(1),
    });
    expect(extract(aca, withTotal, 'Consumo 130 kWh\n' + text).lines[0]).toEqual(
      expect.objectContaining({ consumption: 130, consumptionF1: 60, consumptionF2: null }),
    );
  });

  it('parola di più termini: gli spazi valgono anche l’a capo', () => {
    const text = "CONSUMO\n1.417   kWh\nPuoi pagare con l'avviso\nTotale 20 kWh";
    const r = rules({ consumption: fromPdf({ kind: 'numberBefore', word: 'kWh  Puoi pagare' }) });
    expect(extract(aca, r, text).lines[0]).toEqual(
      expect.objectContaining({ consumption: 1417, unit: 'kWh' }),
    );
    const anchored = rules({
      consumption: fromPdf({ kind: 'numberAfter', word: 'Totale', anchor: 'pagare con' }),
    });
    expect(extract(aca, anchored, text).lines[0].consumption).toBe(20);
  });

  it('il PDF non conta nel riconoscimento della struttura', () => {
    const r = rules({ meter: fromPdf({ kind: 'textAfter', word: 'Contatore n.' }) });
    expect(usesPdf(r)).toBe(true);
    expect(usesPdf(ACA_RULES)).toBe(false);
    expect(patternMatches(aca, r)).toBe(true);
    expect(rulePaths(r)).toEqual(rulePaths(rules({})));
  });
});

describe('numberBefore e fromAnchor', () => {
  it('salta le occorrenze senza un numero subito prima', () => {
    expect(numberBefore('F1 (kWh) Fascia F2 kWh 0,000 kWh', 'kWh')).toBe(0);
    expect(numberBefore('totale 4.078,000   kWh', 'KWH')).toBe(4078);
    expect(numberBefore('nessun numero kWh', 'kWh')).toBeNull();
  });

  it('ancora assente: null; senza ancora: tutto il testo', () => {
    expect(fromAnchor('abc def', 'xyz')).toBeNull();
    expect(fromAnchor('abc def', 'ABC')).toBe(' def');
    expect(fromAnchor('abc', undefined)).toBe('abc');
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
    const a = {
      id: 1,
      rules: generic,
      paths_count: rulePaths(generic).length,
      document_type: 'TD01',
    };
    const b = {
      id: 2,
      rules: POD_RULES,
      paths_count: rulePaths(POD_RULES).length,
      document_type: 'TD01',
    };
    expect(pickPattern(pod, [a, b])?.id).toBe(2);
    expect(pickPattern(pod, [a, { ...a, id: 3 }])).toBeNull();
    expect(pickPattern(aca, [b])).toBeNull();
  });

  it('pattern separati per tipo documento; tipo documento sempre dal tracciato', () => {
    const invoice = { id: 1, rules: POD_RULES, paths_count: 1, document_type: 'TD01' };
    const credit = { id: 2, rules: POD_RULES, paths_count: 1, document_type: 'TD04' };
    const advance = { id: 3, rules: POD_RULES, paths_count: 1, document_type: 'TD02' };
    expect(pickPattern(pod, [advance])).toBeNull();
    expect(pickPattern(pod, [invoice, credit])?.id).toBe(1);
    expect(pickPattern(asCreditNote(pod), [invoice, credit])?.id).toBe(2);
    expect(pickPattern(asCreditNote(pod), [invoice])).toBeNull();
    expect(isCreditNote(asCreditNote(pod))).toBe(true);
    expect(documentTypeOf(pod)).toBe('TD01');
    // Una regola sul tipo documento non conta: vale TipoDocumento.
    const mapped: PatternRules = {
      ...POD_RULES,
      header: { documentType: { kind: 'none' } },
    };
    expect(extract(asCreditNote(pod), mapped).documentType).toBe('TD04');
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
