import { readFileSync } from 'fs';
import { join } from 'path';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import { groupVariants, InvoicePatternsService } from './invoice-patterns.service';
import { PDF_PATH, rulePaths, structureKey, type PatternRules } from './pattern/pattern-rules';
import { pdfText } from './sdi/pdf-text';

jest.mock('./sdi/pdf-text', () => ({ pdfText: jest.fn() }));
const mockPdfText = pdfText as jest.MockedFunction<typeof pdfText>;

const podXml = readFileSync(join(__dirname, 'sdi/fixtures/fattura-pod.xml'));
const acaXml = readFileSync(join(__dirname, 'sdi/fixtures/fattura-aca.xml'));

const RULES: PatternRules = {
  header: {},
  line: {
    utility: {
      kind: 'field',
      path: 'AltriDatiGestionali/RiferimentoTesto',
      where: { path: 'AltriDatiGestionali/TipoDato', equals: 'POD' },
    },
    amount: { kind: 'grossAmount' },
  },
};

const message = (over: Record<string, unknown> = {}) => ({
  id: 9,
  kind: 'INVOICE',
  status: SdiMessageStatus.PENDING,
  supplier_id_fk: 46,
  supplier_vat: '01234567897',
  structure_key: structureKey(podXml),
  file_name: 'IT01234567897_p0D01.xml',
  ...over,
});

describe('InvoicePatternsService', () => {
  let patterns: { findOneBy: jest.Mock; save: jest.Mock; update: jest.Mock };
  let messages: { findOneBy: jest.Mock; findBy: jest.Mock; update: jest.Mock };
  let query: jest.Mock;
  let importer: { readMessageFile: jest.Mock; readMessageFiles: jest.Mock; reprocess: jest.Mock };
  let matcher: { match: jest.Mock };
  let service: InvoicePatternsService;

  beforeEach(() => {
    patterns = {
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (p) => ({ id: 3, ...p })),
      update: jest.fn(),
    };
    messages = {
      findOneBy: jest.fn().mockResolvedValue(message()),
      findBy: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    query = jest.fn().mockResolvedValue([]);
    importer = {
      readMessageFile: jest.fn().mockResolvedValue({ content: podXml }),
      readMessageFiles: jest.fn().mockResolvedValue(new Map()),
      reprocess: jest.fn().mockResolvedValue({ extracted: 0, skipped: 0, queued: 0 }),
    };
    matcher = {
      match: jest.fn(async () => ({
        supplierId: 46,
        existingInvoiceId: null,
        contratto_id_fk: 5,
        lines: [
          { utility_id_fk: 812, amount: 122, contract_id: 5, commitment_id_fk: 70 },
          { utility_id_fk: 812, amount: 61, contract_id: 5, commitment_id_fk: 70 },
          { utility_id_fk: 812, amount: -0.01, contract_id: 5, commitment_id_fk: 70 },
        ],
        issues: [],
        blocking: [],
        meters: [],
        meterFills: [],
      })),
    };
    service = new InvoicePatternsService(
      patterns as never,
      messages as never,
      { query } as never,
      importer as never,
      matcher as never,
    );
  });

  it('analisi: su quante fatture simili ogni campo mappato ha un valore, file in memoria', async () => {
    messages.findBy.mockResolvedValue([message({ id: 9 }), message({ id: 10 })]);
    importer.readMessageFiles.mockResolvedValue(new Map([[9, podXml]]));
    const rules: PatternRules = { ...RULES, header: { cig: { kind: 'none' } } };
    expect(await service.analyze(9, [9, 10], rules)).toEqual({
      analyzed: 2,
      unavailable: 1,
      matches: 1,
      found: { utility: 1, amount: 1 },
      notFound: {},
      unmatched: [],
    });
    // Campo senza valore: l'id della fattura, per aprirla dall'editor.
    const withMeter: PatternRules = {
      ...RULES,
      line: { ...RULES.line, meter: { kind: 'field', path: 'Assente/Matricola' } },
    };
    expect(await service.analyze(9, [9], withMeter)).toEqual(
      expect.objectContaining({ notFound: { meter: [9] }, unmatched: [9] }),
    );
    expect(messages.findBy).toHaveBeenCalledWith(expect.objectContaining({ supplier_id_fk: 46 }));
    // La seconda volta la fattura 9 è già in memoria: si chiede alla PEC solo la 10.
    await service.analyze(9, [9, 10], rules);
    expect(importer.readMessageFiles).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 10 }),
    ]);
    await expect(service.analyze(9, [], rules)).rejects.toThrow('Indica da 1 a 25 fatture');
  });

  it('fatture senza pattern: una riga per fornitore, esempio dalla struttura più frequente', async () => {
    query.mockResolvedValue([
      {
        supplier_id: 46,
        supplier: 'Energia Prova',
        structure_key: 'abc',
        document_type: 'TD04',
        count: '88',
        structures: '4',
        message_id: '12',
      },
    ]);
    expect(await service.unknown()).toEqual([
      {
        supplier_id: 46,
        supplier: 'Energia Prova',
        document_type: 'TD04',
        structure_key: 'abc',
        count: 88,
        structures: 4,
        message_id: 12,
      },
    ]);
    const sql = String(query.mock.calls[0][0]);
    // Tag facoltativi diversi non fanno righe separate: si raggruppa per fornitore e tipo.
    expect(sql).toMatch(/PARTITION BY m\.supplier_id_fk, IFNULL\(m\.document_type/);
    expect(sql).toContain('rn = 1');
  });

  it('fatture senza pattern col tipo da leggere: tipo completato in background dalla PEC', async () => {
    (importer as unknown as { configured: boolean }).configured = true;
    query
      .mockResolvedValueOnce([{ supplier_id: 46, supplier: 'Energia Prova', document_type: '' }])
      .mockResolvedValueOnce([{ id: 9 }, { id: 10 }])
      .mockResolvedValueOnce([]);
    messages.findBy.mockResolvedValue([message({ id: 9 }), message({ id: 10 })]);
    importer.readMessageFiles.mockResolvedValue(new Map([[9, podXml]]));
    await service.unknown();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(String(query.mock.calls[1][0])).toContain('document_type IS NULL');
    expect(messages.update).toHaveBeenCalledWith(9, { document_type: 'TD01' });
    // File sparito dalla PEC: tipo vuoto, per non ritentare.
    expect(messages.update).toHaveBeenCalledWith(10, { document_type: '' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('anteprima: estrae e riscontra senza scrivere nulla', async () => {
    const preview = await service.preview(9, RULES);
    expect(preview.matches).toBe(true);
    expect(preview.extracted?.lines).toHaveLength(3);
    expect(preview.checks).toContainEqual(
      expect.objectContaining({ field: 'utility', tone: 'ok' }),
    );
    expect(patterns.save).not.toHaveBeenCalled();
    expect(patterns.update).not.toHaveBeenCalled();
    expect(messages.update).not.toHaveBeenCalled();
  });

  it('anteprima della matricola: accanto a quella attuale, verde se coincide', async () => {
    matcher.match.mockResolvedValueOnce({
      supplierId: 46,
      existingInvoiceId: null,
      contratto_id_fk: 5,
      lines: [],
      issues: [],
      blocking: [],
      meters: [
        { utilityId: 811, meter: '0055', previous: '55' },
        { utilityId: 812, meter: '9', previous: '8' },
        { utilityId: 813, meter: '77', previous: null },
      ],
      meterFills: [
        { utilityId: 812, meter: '9', previous: '8' },
        { utilityId: 813, meter: '77', previous: null },
      ],
    });
    const preview = await service.preview(9, RULES);
    const meter = preview.checks.filter((c) => c.field === 'meter');
    expect(meter).toEqual([
      {
        field: 'meter',
        tone: 'ok',
        text: "Matricola 0055: coincide con l'attuale 55 (utenza 811)",
      },
      {
        field: 'meter',
        tone: 'warn',
        text: 'Matricola 9, attuale 8 (utenza 812): verrà aggiornata',
      },
      {
        field: 'meter',
        tone: 'warn',
        text: 'Matricola 77, attuale nessuna (utenza 813): verrà completata',
      },
    ]);
  });

  it('anteprima con differenze: badge giallo sul campo', async () => {
    matcher.match.mockResolvedValueOnce({
      supplierId: 46,
      existingInvoiceId: 321,
      contratto_id_fk: 5,
      lines: [],
      issues: [{ type: 'CIG_MISMATCH', lineIndex: 0, detail: 'CIG fattura A, contratto B' }],
      blocking: [],
      meters: [],
      meterFills: [],
    });
    const preview = await service.preview(9, {
      ...RULES,
      header: { cig: { kind: 'field', path: 'DatiGenerali/DatiContratto/CodiceCIG' } },
    });
    expect(preview.checks).toContainEqual({
      field: 'cig',
      tone: 'warn',
      text: 'CIG fattura A, contratto B',
    });
    expect(preview.checks).toContainEqual(
      expect.objectContaining({ field: 'number', text: expect.stringContaining('arricchita') }),
    );
  });

  it('salvataggio rifiutato se il pattern non riconosce la fattura di partenza', async () => {
    importer.readMessageFile.mockResolvedValue({ content: acaXml });
    await expect(
      service.create({ message_id: 9, name: 'Energia', rules: RULES }, 7),
    ).rejects.toThrow('Il pattern non riconosce la fattura di partenza.');
    expect(patterns.save).not.toHaveBeenCalled();
  });

  it('salvataggio rifiutato senza utenza o importo di riga', async () => {
    await expect(
      service.create(
        {
          message_id: 9,
          name: 'Energia',
          rules: { header: {}, line: { amount: { kind: 'grossAmount' } } },
        },
        7,
      ),
    ).rejects.toThrow('Indica almeno utenza e importo della riga.');
  });

  it('salvataggio: pattern del fornitore del messaggio e rielaborazione delle fatture in attesa', async () => {
    query.mockResolvedValue([{ id: 9 }, { id: 10 }]);
    const result = await service.create({ message_id: 9, name: 'Energia', rules: RULES }, 7);
    expect(patterns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id_fk: 46,
        name: 'Energia',
        ignored: false,
        structure_key: structureKey(podXml),
        paths_count: rulePaths(RULES).length,
        created_by_user_id: 7,
      }),
    );
    expect(importer.reprocess).toHaveBeenCalledWith([9, 10]);
    expect(result.reprocessing).toBe(2);
  });

  it('ignora la struttura: pattern ignorato senza regole', async () => {
    await service.ignore({ message_id: 9, name: 'Avvisi' }, 7);
    expect(patterns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ignored: true,
        rules: null,
        structure_key: structureKey(podXml),
        supplier_id_fk: 46,
      }),
    );
  });

  it('struttura già ignorata: 400, nessun doppione', async () => {
    patterns.findOneBy.mockResolvedValue({ id: 8, ignored: true, deleted: false });
    await expect(service.ignore({ message_id: 9, name: 'Avvisi' }, 7)).rejects.toThrow(
      'Struttura già ignorata.',
    );
    expect(patterns.save).not.toHaveBeenCalled();
  });

  it('modifica: documento di un altro tipo rifiutato (pattern separati per tipo)', async () => {
    patterns.findOneBy.mockResolvedValue({
      id: 3,
      supplier_id_fk: 46,
      deleted: false,
      ignored: false,
      document_type: 'TD04',
    });
    await expect(
      service.update(3, { message_id: 9, name: 'Note', rules: RULES }, 7),
    ).rejects.toThrow('Il pattern è per i documenti TD04');
    expect(patterns.update).not.toHaveBeenCalled();
  });

  it('modifica: rielabora anche le fatture già estratte con quel pattern', async () => {
    patterns.findOneBy.mockResolvedValue({
      id: 3,
      supplier_id_fk: 46,
      deleted: false,
      ignored: false,
      document_type: 'TD01',
    });
    query.mockImplementation(async (_sql: string, params: unknown[]) =>
      params.includes(3) ? [{ id: 9 }, { id: 20 }] : [],
    );
    await service.update(3, { message_id: 9, name: 'Energia 2', rules: RULES }, 7);
    expect(patterns.update).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ name: 'Energia 2', updated_by_user_id: 7 }),
    );
    expect(importer.reprocess).toHaveBeenCalledWith([9, 20]);
  });

  it('varianti: dalla più numerosa, numerazione uguale da qualunque fattura', () => {
    const rows = [
      { id: 50, structure_key: 'b' },
      { id: 40, structure_key: 'a' },
      { id: 30, structure_key: 'b' },
      { id: 20, structure_key: 'c' },
      { id: 10, structure_key: 'b' },
      { id: 5, structure_key: 'c' },
    ];
    expect(groupVariants(rows)).toEqual({
      similar: [50, 30, 10, 20, 5, 40],
      variants: [
        { start: 0, count: 3 },
        { start: 3, count: 2 },
        { start: 5, count: 1 },
      ],
      numbers: [null, null, null, null, null, null],
    });
  });

  it('editor: XML, catalogo ordinato, simili e nome del fornitore', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM third_parties')
        ? [{ supplier: 'Energia Prova S.p.A.' }]
        : [
            { id: 12, structure_key: 'x' },
            { id: 9, structure_key: 'x' },
          ],
    );
    const editor = await service.editor(9);
    expect(editor.message).toEqual(
      expect.objectContaining({ id: 9, supplier_id: 46, supplier: 'Energia Prova S.p.A.' }),
    );
    expect(editor.similar).toEqual([12, 9]);
    expect(editor.variants).toEqual([{ start: 0, count: 2 }]);
    // Simili: fatture del fornitore senza pattern.
    const similarSql = query.mock.calls
      .map(([s]) => String(s))
      .find((s) => s.includes('SELECT m.id, m.structure_key'));
    expect(similarSql).toContain('pattern_id_fk IS NULL');
    expect(editor.ranked.utility[0]).toContain('AltriDatiGestionali/TipoDato=POD');
    expect(editor.xml).toContain('<Numero>EP 7/26</Numero>');
  });

  it('editor con PDF allegato: testo e fonte «Testo del PDF» in cima a consumo e matricola', async () => {
    query.mockResolvedValue([]);
    mockPdfText.mockResolvedValueOnce('Contatore n. 98765');
    const editor = await service.editor(9);
    expect(editor.pdf_text).toBe('Contatore n. 98765');
    expect(editor.ranked.consumption[0]).toBe(`header|${PDF_PATH}|`);
    expect(editor.ranked.meter[0]).toBe(`header|${PDF_PATH}|`);
    expect(editor.ranked.contractRef[0]).toBe(`header|${PDF_PATH}|`);
    // Per gli altri campi il PDF c'è, ma in fondo (anche ragione sociale, tipo
    // documento e importo di riga).
    expect(editor.ranked.utility[editor.ranked.utility.length - 1]).toBe(`header|${PDF_PATH}|`);
    expect(editor.ranked.supplierName).toContain(`header|${PDF_PATH}|`);
    expect(editor.ranked.documentType).not.toContain(`header|${PDF_PATH}|`);
    expect(editor.ranked.amount).toContain(`header|${PDF_PATH}|`);
  });

  it('anteprima con regola sul PDF: legge il testo del PDF', async () => {
    mockPdfText.mockResolvedValueOnce('Codice 1 Contatore n. 98765');
    const rules: PatternRules = {
      header: {},
      line: {
        ...RULES.line,
        meter: { kind: 'textAfter', path: PDF_PATH, word: 'Contatore n.', fromHeader: true },
      },
    };
    const preview = await service.preview(9, rules);
    expect(preview.extracted?.lines[0].meter).toBe('98765');
    expect(preview.occurrences.meter).toEqual([
      { n: 1, context: 'Codice 1 Contatore n. 98765', value: '98765' },
    ]);
  });

  it.each([
    [
      '«presente la parola» fuori dal consumo stimato',
      { meter: { kind: 'contains', path: PDF_PATH, word: 'x' } },
    ],
    [
      'consumo stimato con un numero prima della parola',
      { estimated: { kind: 'numberBefore', path: PDF_PATH, word: 'x' } },
    ],
    [
      'occorrenza non intera',
      {
        meter: { kind: 'textAfter', path: PDF_PATH, word: 'x', fromHeader: true, occurrence: 1.5 },
      },
    ],
    [
      'PDF con una regola che non cerca una parola',
      { meter: { kind: 'fromHeader', path: PDF_PATH } },
    ],
    [
      'ancora su una regola senza parola',
      { meter: { kind: 'field', path: 'Descrizione', anchor: 'x' } },
    ],
  ])('regole non valide: %s', async (_, line) => {
    await expect(
      service.create(
        {
          message_id: 9,
          name: 'X',
          rules: { header: {}, line: { ...RULES.line, ...line } } as never,
        },
        7,
      ),
    ).rejects.toThrow('Regole del pattern non valide.');
  });

  it('regole non valide: 400', async () => {
    await expect(
      service.create(
        {
          message_id: 9,
          name: 'X',
          rules: { header: {}, line: { utility: { kind: 'boh' } } } as never,
        },
        7,
      ),
    ).rejects.toThrow('Regole del pattern non valide.');
  });
});
