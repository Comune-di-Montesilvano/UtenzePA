import { readFileSync } from 'fs';
import { join } from 'path';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import { InvoicePatternsService } from './invoice-patterns.service';
import { rulePaths, structureKey, type PatternRules } from './pattern/pattern-rules';

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
  let messages: { findOneBy: jest.Mock; update: jest.Mock };
  let query: jest.Mock;
  let importer: { readMessageFile: jest.Mock; reprocess: jest.Mock };
  let matcher: { match: jest.Mock };
  let service: InvoicePatternsService;

  beforeEach(() => {
    patterns = {
      findOneBy: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (p) => ({ id: 3, ...p })),
      update: jest.fn(),
    };
    messages = { findOneBy: jest.fn().mockResolvedValue(message()), update: jest.fn() };
    query = jest.fn().mockResolvedValue([]);
    importer = {
      readMessageFile: jest.fn().mockResolvedValue({ content: podXml }),
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

  it('fatture senza pattern: una riga per fornitore, esempio dalla struttura più frequente', async () => {
    query.mockResolvedValue([
      {
        supplier_id: 46,
        supplier: 'Energia Prova',
        structure_key: 'abc',
        count: '88',
        structures: '4',
        message_id: '12',
      },
    ]);
    expect(await service.unknown()).toEqual([
      { supplier_id: 46, supplier: 'Energia Prova', structure_key: 'abc', count: 88, structures: 4, message_id: 12 },
    ]);
    const sql = String(query.mock.calls[0][0]);
    // Tag facoltativi diversi non fanno righe separate: si raggruppa per fornitore.
    expect(sql).toMatch(/PARTITION BY m\.supplier_id_fk/);
    expect(sql).toContain('rn = 1');
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

  it('anteprima con matricola diversa: badge rosso «import fermo», da completare in verde', async () => {
    matcher.match.mockResolvedValueOnce({
      supplierId: 46,
      existingInvoiceId: null,
      contratto_id_fk: 5,
      lines: [],
      issues: [],
      blocking: [{ type: 'METER_MISMATCH', lineIndex: 0, utilityId: 812, value: '9', detail: 'IT001E1: matricola in fattura 9, in anagrafica 8' }],
      meters: [],
      meterFills: [{ utilityId: 813, meter: '77' }],
    });
    const preview = await service.preview(9, RULES);
    expect(preview.checks).toContainEqual({
      field: 'meter',
      tone: 'danger',
      text: 'IT001E1: matricola in fattura 9, in anagrafica 8: import fermo',
    });
    expect(preview.checks).toContainEqual(expect.objectContaining({ field: 'meter', tone: 'ok' }));
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
    await expect(service.ignore({ message_id: 9, name: 'Avvisi' }, 7)).rejects.toThrow('Struttura già ignorata.');
    expect(patterns.save).not.toHaveBeenCalled();
  });

  it('modifica: rielabora anche le fatture già estratte con quel pattern', async () => {
    patterns.findOneBy.mockResolvedValue({
      id: 3,
      supplier_id_fk: 46,
      deleted: false,
      ignored: false,
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

  it('editor: XML, catalogo ordinato, simili e nome del fornitore', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM third_parties') ? [{ supplier: 'Energia Prova S.p.A.' }] : [{ id: 12 }, { id: 9 }],
    );
    const editor = await service.editor(9);
    expect(editor.message).toEqual(expect.objectContaining({ id: 9, supplier_id: 46, supplier: 'Energia Prova S.p.A.' }));
    expect(editor.similar).toEqual([12, 9]);
    // Simili: fatture del fornitore senza pattern, prima quelle con la stessa struttura.
    const similarSql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('ORDER BY (structure_key'));
    expect(similarSql).toContain('pattern_id_fk IS NULL');
    expect(editor.ranked.utility[0]).toContain('AltriDatiGestionali/TipoDato=POD');
    expect(editor.xml).toContain('<Numero>EP 7/26</Numero>');
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
