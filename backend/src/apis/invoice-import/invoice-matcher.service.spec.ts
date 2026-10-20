import { ImportIssueType } from './enum/import-issue-type.enum';
import { InvoiceMatcher } from './invoice-matcher.service';
import type { ExtractedInvoice, ExtractedLine } from './pattern/pattern-rules';

type Handler = (params: unknown[]) => unknown[];

// Risponde in base al marcatore /* m_… */ della query.
function fakeDb(handlers: Record<string, Handler>) {
  return {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      const marker = /\/\* (m_\w+) \*\//.exec(sql)?.[1] ?? '';
      return handlers[marker]?.(params) ?? [];
    }),
  };
}

const line = (over: Partial<ExtractedLine> = {}): ExtractedLine => ({
  utility: 'IT001E00000001',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  amount: 10,
  description: 'Materia energia',
  consumption: null,
  consumptionF1: null,
  consumptionF2: null,
  consumptionF3: null,
  unit: null,
  meter: null,
  estimated: false,
  readings: [],
  readingCells: null,
  ...over,
});

const invoice = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  supplierVat: '01234567897',
  supplierName: 'Energia Prova S.p.A.',
  number: 'EP 7/26',
  date: '2026-07-10',
  documentType: 'TD01',
  total: 20,
  netAmount: null,
  cig: null,
  contractRef: null,
  lines: [line(), line({ amount: 10 })],
  ...over,
});

const UTILITIES: Record<string, { id: number; budget_chapter_code_fk: number | null }> = {
  IT001E00000001: { id: 812, budget_chapter_code_fk: 30 },
  '00123456789012': { id: 900, budget_chapter_code_fk: 30 },
  IT001E00000002: { id: 813, budget_chapter_code_fk: 30 },
};

const baseHandlers = (): Record<string, Handler> => ({
  m_utility: ([code]) => (UTILITIES[code as string] ? [UTILITIES[code as string]] : []),
  m_contract: ([utilityId]) =>
    utilityId === 813
      ? [{ id: 6, cig_contract: 'ZZ00000000' }]
      : [{ id: 5, cig_contract: 'AB12345678' }],
  m_commitment: () => [{ id: 70 }],
  m_supplier: () => [{ company_name: 'ENERGIA PROVA SPA', last_name: null, first_name: null }],
  m_invoice: () => [],
});

const matcher = (handlers: Record<string, Handler>) =>
  new InvoiceMatcher(fakeDb(handlers) as never);

describe('InvoiceMatcher', () => {
  it('POD trovato: utenza, contratto in vigore e impegno sulle righe', async () => {
    const result = await matcher(baseHandlers()).match(invoice(), 46);
    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        utility_id_fk: 812,
        contract_id: 5,
        commitment_id_fk: 70,
        supply_code: 'IT001E00000001',
      }),
    );
    expect(result.contratto_id_fk).toBe(5);
    expect(result.issues).toEqual([]);
    expect(result.existingInvoiceId).toBeNull();
  });

  it('PDR di 13 cifre: trovato normalizzato a 14', async () => {
    const result = await matcher(baseHandlers()).match(
      invoice({ lines: [line({ utility: '0123456789012' })] }),
      46,
    );
    expect(result.lines[0].utility_id_fk).toBe(900);
  });

  it('codice sconosciuto: riga senza utenza e segnalazione', async () => {
    const result = await matcher(baseHandlers()).match(
      invoice({ lines: [line({ utility: 'IT999E99999999' })] }),
      46,
    );
    expect(result.lines[0].utility_id_fk).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: ImportIssueType.UNKNOWN_UTILITY,
        lineIndex: 0,
        detail: expect.stringContaining('IT999E99999999'),
      }),
    ]);
  });

  it('riga senza codice in una fattura con una sola utenza: la eredita (Indennizzo)', async () => {
    const result = await matcher(baseHandlers()).match(
      invoice({
        lines: [
          line(),
          line({ utility: null, periodStart: null, periodEnd: null, description: 'Indennizzo' }),
        ],
      }),
      46,
    );
    expect(result.lines[1]).toEqual(
      expect.objectContaining({ utility_id_fk: 812, contract_id: 5 }),
    );
  });

  it('CIG diverso da quello del contratto: segnalazione', async () => {
    const result = await matcher(baseHandlers()).match(invoice({ cig: 'CD87654321' }), 46);
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: ImportIssueType.CIG_MISMATCH,
        detail: 'CIG fattura CD87654321, contratto AB12345678',
      }),
    ]);
  });

  it('righe su due contratti: contratto di testata vuoto e segnalazione', async () => {
    const result = await matcher(baseHandlers()).match(
      invoice({ lines: [line(), line({ utility: 'IT001E00000002' })] }),
      46,
    );
    expect(result.contratto_id_fk).toBeNull();
    expect(result.issues.map((i) => i.type)).toEqual([ImportIssueType.MIXED_CONTRACTS]);
  });

  it('impegno mancante con contratto e capitolo noti: segnalazione', async () => {
    const result = await matcher({ ...baseHandlers(), m_commitment: () => [] }).match(
      invoice(),
      46,
    );
    expect(result.lines[0].commitment_id_fk).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({
        type: ImportIssueType.MISSING_COMMITMENT,
        detail: expect.stringContaining('2026'),
      }),
    ]);
  });

  it('ragione sociale con forma societaria scritta diversamente: nessuna segnalazione', async () => {
    const same = await matcher(baseHandlers()).match(
      invoice({ supplierName: 'Energia Prova S.p.A.' }),
      46,
    );
    expect(same.issues).toEqual([]);
    const other = await matcher(baseHandlers()).match(
      invoice({ supplierName: 'Altra Energia Srl' }),
      46,
    );
    expect(other.issues.map((i) => i.type)).toEqual([ImportIssueType.SUPPLIER_NAME_MISMATCH]);
  });

  it('fattura già presente (fornitore, numero, data): id da arricchire', async () => {
    const result = await matcher({ ...baseHandlers(), m_invoice: () => [{ id: 321 }] }).match(
      invoice(),
      46,
    );
    expect(result.existingInvoiceId).toBe(321);
  });

  it('utenza dal riferimento contratto se mappa una sola utenza', async () => {
    const result = await matcher({
      ...baseHandlers(),
      m_contract_ref: () => [UTILITIES.IT001E00000001],
    }).match(invoice({ contractRef: 'ORD-1', lines: [line({ utility: null })] }), 46);
    expect(result.lines[0].utility_id_fk).toBe(812);
  });
});

describe('InvoiceMatcher: codice cliente del fornitore', () => {
  it('il codice cliente vale solo per le utenze con un contratto dello stesso fornitore', async () => {
    const query = jest.fn(async () => []);
    await new InvoiceMatcher({ query } as never).match(
      invoice({ lines: [line({ utility: '1234567' })] }),
      46,
    );
    const call = query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('m_utility'),
    ) as unknown[];
    expect(String(call[0])).toMatch(/utility_code = \? AND EXISTS[\s\S]*c\.supplier_id_fk = \?/);
    expect(call[1]).toEqual(['1234567', '1234567', 46, '1234567']);
  });
});

describe('InvoiceMatcher: matricola del contatore', () => {
  const withMeter = (meter: string | null) => ({
    ...baseHandlers(),
    m_utility: ([code]: unknown[]) =>
      UTILITIES[code as string] ? [{ ...UTILITIES[code as string], meter_number: meter }] : [],
  });
  const withInvoiceMeter = (meter: string) =>
    invoice({ lines: [line({ meter }), line({ meter, amount: 10 })] });

  it('utenza senza matricola: da completare con quella della fattura', async () => {
    const result = await matcher(withMeter(null)).match(withInvoiceMeter('000000000000283767'), 46);
    expect(result.meterFills).toEqual([
      { utilityId: 812, meter: '000000000000283767', previous: null },
    ]);
    expect(result.blocking).toEqual([]);
  });

  it('stessa matricola con zeri iniziali diversi: nessuna differenza', async () => {
    const result = await matcher(withMeter('283767')).match(
      withInvoiceMeter('000000000000283767'),
      46,
    );
    expect(result.meterFills).toEqual([]);
    expect(result.blocking).toEqual([]);
  });

  it('matricola diversa: vale quella della fattura, nessun blocco', async () => {
    const result = await matcher(withMeter('000000000000003983')).match(
      withInvoiceMeter('000000000000285039'),
      46,
    );
    expect(result.blocking).toEqual([]);
    expect(result.meterFills).toEqual([
      { utilityId: 812, meter: '000000000000285039', previous: '000000000000003983' },
    ]);
  });

  it('fattura senza matricola: nessun controllo', async () => {
    const result = await matcher(withMeter('123')).match(invoice(), 46);
    expect(result.blocking).toEqual([]);
    expect(result.meterFills).toEqual([]);
  });
});
