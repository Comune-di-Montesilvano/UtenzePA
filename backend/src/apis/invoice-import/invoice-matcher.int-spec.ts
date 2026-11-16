import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertContract,
  insertInvoice,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { ImportIssueType } from './enum/import-issue-type.enum';
import { InvoiceMatcher } from './invoice-matcher.service';
import type { ExtractedInvoice, ExtractedLine } from './pattern/pattern-rules';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

const line = (over: Partial<ExtractedLine> = {}): ExtractedLine => ({
  utility: null,
  periodStart: '2025-03-01',
  periodEnd: '2025-03-31',
  amount: 100,
  description: null,
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
  supplierVat: '01234567890',
  supplierName: null,
  number: 'FT-1',
  date: '2025-04-10',
  documentType: 'TD01',
  total: 100,
  netAmount: null,
  cig: null,
  contractRef: null,
  lines: [line()],
  ...over,
});

describe('InvoiceMatcher (integrazione)', () => {
  let ds: DataSource;
  let matcher: InvoiceMatcher;
  let supplier: number;
  let other: number;

  beforeAll(async () => {
    ds = await itDataSource();
    matcher = new InvoiceMatcher(ds);
  });

  afterAll(() => ds.destroy());

  beforeEach(async () => {
    await resetTables(ds, [
      'budget_commitment_years',
      'budget_commitment_contracts',
      'budget_commitments',
      'budget_chapters',
      'invoices',
      'contract_utilities',
      'contracts',
      'utilities',
      'third_parties',
    ]);
    supplier = await insertThirdParty(ds, { company_name: 'Energia Prova S.p.A.' });
    other = await insertThirdParty(ds);
  });

  const contractOf = async (utilities: number[], over: Record<string, unknown> = {}) => {
    const id = await insertContract(ds, { supplier_id_fk: supplier, ...over });
    for (const u of utilities)
      await insert(ds, 'contract_utilities', { contract_id: id, utility_id: u });
    return id;
  };
  const commitmentFor = async (
    contract: number,
    year: number,
    over: Record<string, unknown> = {},
  ) => {
    const chapter = await insert(ds, 'budget_chapters', { ...AUTHOR, chapter_code: `C${year}` });
    const id = await insert(ds, 'budget_commitments', {
      ...AUTHOR,
      budget_chapter_id_fk: chapter,
      ...over,
    });
    await insert(ds, 'budget_commitment_years', {
      commitment_id: id,
      fiscal_year: year,
      amount: 10,
    });
    await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id: contract });
    return id;
  };
  const unknownUtilities = (issues: { type: ImportIssueType }[]) =>
    issues.filter((i) => i.type === ImportIssueType.UNKNOWN_UTILITY).length;

  describe('utenza della riga', () => {
    it('dal POD normalizzato, mai cancellata', async () => {
      const u = await insertUtility(ds, { utility_id: 'IT001E12345678' });
      await insertUtility(ds, { utility_id: 'IT001E99999999', deleted: 1 });
      const result = await matcher.match(
        invoice({
          lines: [line({ utility: 'it001e123456789' }), line({ utility: 'IT001E99999999' })],
        }),
        supplier,
      );
      expect(result.lines.map((l) => l.utility_id_fk)).toEqual([u, null]);
      expect(unknownUtilities(result.issues)).toBe(1);
    });

    it('dal codice cliente solo con un contratto non cancellato del fornitore; il POD vince', async () => {
      const byCode = await insertUtility(ds, { utility_code: 'CLI-1' });
      await contractOf([byCode]);
      const otherSupplier = await insertUtility(ds, { utility_code: 'CLI-2' });
      await insertContract(ds, { supplier_id_fk: other }).then((c) =>
        insert(ds, 'contract_utilities', { contract_id: c, utility_id: otherSupplier }),
      );
      const deletedContract = await insertUtility(ds, { utility_code: 'CLI-3' });
      await contractOf([deletedContract], { deleted: 1 });
      // Stesso valore come codice cliente di una e come POD di un'altra: vale il POD.
      const sharedCode = await insertUtility(ds, { utility_code: 'CLI-4' });
      await contractOf([sharedCode]);
      const byPod = await insertUtility(ds, { utility_id: 'CLI-4' });

      const result = await matcher.match(
        invoice({
          lines: ['CLI-1', 'CLI-2', 'CLI-3', 'CLI-4'].map((utility) => line({ utility })),
        }),
        supplier,
      );
      expect(result.lines.map((l) => l.utility_id_fk)).toEqual([byCode, null, null, byPod]);
    });

    it('senza codici: utenza dal riferimento contratto se ne indica una sola, mai bozze', async () => {
      const u = await insertUtility(ds);
      await contractOf([u], { consip_order: 'ORD-1' });
      const draft = await insertUtility(ds);
      await contractOf([draft], { consip_order: 'ORD-2', draft: 1 });
      const twoA = await insertUtility(ds);
      const twoB = await insertUtility(ds);
      await contractOf([twoA, twoB], { cig_contract: 'CIG0000001' });

      const one = await matcher.match(invoice({ contractRef: ' ORD-1 ' }), supplier);
      const ofDraft = await matcher.match(invoice({ contractRef: 'ORD-2' }), supplier);
      const ofTwo = await matcher.match(invoice({ contractRef: 'CIG0000001' }), supplier);
      expect([one, ofDraft, ofTwo].map((r) => r.lines[0].utility_id_fk)).toEqual([u, null, null]);
    });
  });

  describe('contratto', () => {
    it('della riga: del fornitore, in vigore alla fine del periodo, il più recente; mai bozze o cancellati', async () => {
      const u = await insertUtility(ds, { utility_id: 'POD-C' });
      await contractOf([u], { supply_start_date: '2024-01-01', supply_expiry_date: '2024-12-31' });
      const current = await contractOf([u], { supply_start_date: '2025-01-01' });
      const older = await contractOf([u], { supply_start_date: '2024-06-01' });
      await contractOf([u], { supply_start_date: '2025-02-01', draft: 1 });
      await contractOf([u], { supply_start_date: '2025-02-01', deleted: 1 });
      await insertContract(ds, { supplier_id_fk: other, supply_start_date: '2025-03-01' }).then(
        (c) => insert(ds, 'contract_utilities', { contract_id: c, utility_id: u }),
      );
      const result = await matcher.match(
        invoice({
          lines: [
            line({ utility: 'POD-C' }),
            line({ utility: 'POD-C', periodStart: '2024-10-01', periodEnd: '2024-10-31' }),
            line({ utility: 'POD-C', periodStart: '2023-01-01', periodEnd: '2023-01-31' }),
          ],
        }),
        supplier,
      );
      expect(result.lines.map((l) => l.contract_id)).toEqual([current, older, null]);
    });

    it('di testata per le righe senza utenza: CIG o ordine, uno solo, mai bozze', async () => {
      const byCig = await contractOf([], { cig_contract: ' CIG0000009 ' });
      await contractOf([], { consip_order: 'ORD-9', draft: 1 });
      await contractOf([], { consip_order: 'ORD-8' });
      await contractOf([], { consip_order: 'ORD-8' });

      const cig = await matcher.match(invoice({ cig: 'CIG0000009' }), supplier);
      const draft = await matcher.match(invoice({ contractRef: 'ORD-9' }), supplier);
      const ambiguous = await matcher.match(invoice({ contractRef: 'ORD-8' }), supplier);
      expect([cig, draft, ambiguous].map((r) => r.contratto_id_fk)).toEqual([byCig, null, null]);
    });

    it('impegno mancante nell’esercizio di competenza: segnalato; impegno cancellato non conta', async () => {
      const covered = await contractOf([], { cig_contract: 'CIG0000010' });
      await commitmentFor(covered, 2025);
      const deleted = await contractOf([], { cig_contract: 'CIG0000011' });
      await commitmentFor(deleted, 2025, { deleted: 1 });
      const otherYear = await contractOf([], { cig_contract: 'CIG0000012' });
      await commitmentFor(otherYear, 2024);

      const missing = async (cig: string) =>
        (await matcher.match(invoice({ cig }), supplier)).issues.some(
          (i) => i.type === ImportIssueType.MISSING_COMMITMENT,
        );
      expect([
        await missing('CIG0000010'),
        await missing('CIG0000011'),
        await missing('CIG0000012'),
      ]).toEqual([false, true, true]);
    });
  });

  it('ragione sociale diversa dall’anagrafica: segnalata (forma societaria ignorata)', async () => {
    const same = await matcher.match(invoice({ supplierName: 'ENERGIA PROVA SPA' }), supplier);
    const different = await matcher.match(invoice({ supplierName: 'Altra Energia srl' }), supplier);
    const mismatch = (r: { issues: { type: ImportIssueType }[] }) =>
      r.issues.some((i) => i.type === ImportIssueType.SUPPLIER_NAME_MISMATCH);
    expect([mismatch(same), mismatch(different)]).toEqual([false, true]);
  });

  describe('fattura già presente', () => {
    it('stesso numero e data; poi numero normalizzato; poi IdentificativoSdI; mai cancellate', async () => {
      await insertInvoice(ds, {
        supplier_id_fk: supplier,
        invoice_id: 'FT-1',
        invoice_date: '2025-04-10',
        deleted: 1,
      });
      const exact = await insertInvoice(ds, {
        supplier_id_fk: supplier,
        invoice_id: 'FT-1',
        invoice_date: '2025-04-10',
      });
      const normalized = await insertInvoice(ds, {
        supplier_id_fk: supplier,
        invoice_id: 'ft/0002',
        invoice_date: '2025-04-10',
      });
      const bySdi = await insertInvoice(ds, {
        supplier_id_fk: supplier,
        invoice_id: 'FT 3',
        invoice_date: '2025-04-01',
        sdi_identifier: '123456',
      });
      await insertInvoice(ds, {
        supplier_id_fk: other,
        invoice_id: 'FT-4',
        invoice_date: '2025-04-10',
      });

      const found = async (number: string, sdi: string | null = null) =>
        (await matcher.match(invoice({ number }), supplier, sdi)).existingInvoiceId;
      expect(await found('FT-1')).toBe(exact);
      expect(await found('FT 0002')).toBe(normalized);
      expect(await found('FT-3', '123456')).toBe(bySdi);
      expect(await found('FT-3')).toBeNull();
      expect(await found('FT-4')).toBeNull();
    });
  });
});
