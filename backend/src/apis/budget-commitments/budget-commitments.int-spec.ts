import { DataSource } from 'typeorm';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertConsipAgreement,
  insertContract,
  insertInvoice,
  insertThirdParty,
} from '../../test/integration/fixtures';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitment } from './entity/budget-commitment.entity';

// Elenco, scheda e modifiche degli impegni su MySQL vero: speso per annualità
// dalle quote di fatture valide, filtri, annualità sostituite con le quote a
// mano spostate, cancellazione bloccata dalle quote a mano.

const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('BudgetCommitmentsService (integrazione)', () => {
  let ds: DataSource;
  let service: BudgetCommitmentsService;
  let reconciled: number[][];
  let chapterA: number;
  let chapterB: number;
  let enel: number;
  let other: number;
  let k1: number;
  let k2: number;
  let agreement: number;
  // Impegni: big (2025/10, pluriennale 2025-2026, k1+k2), small (2025/3, solo
  // 2025, capitolo B), draft (preimpegno senza numero né importo), gone (cancellato).
  let big: number;
  let small: number;
  let draft: number;
  let gone: number;
  let f1: number;
  let f2: number;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new BudgetCommitmentsService(
      ds.getRepository(BudgetCommitment),
      ds.getRepository(Contract),
      ds.getRepository(BudgetChapter),
      { reconcileSafe: async (ids: number[]) => void reconciled.push(ids) } as never,
    );
  });

  afterAll(() => ds.destroy());

  const commitment = async (
    row: Record<string, unknown>,
    years: Record<number, number | null>,
    contracts: number[],
  ) => {
    const id = await insert(ds, 'budget_commitments', { ...who, ...row });
    for (const [year, amount] of Object.entries(years))
      await insert(ds, 'budget_commitment_years', { commitment_id: id, fiscal_year: year, amount });
    for (const c of contracts)
      await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id: c });
    return id;
  };
  const share = (
    invoice: number,
    commitmentId: number,
    year: number,
    amount: number,
    source = 'AUTO',
  ) =>
    insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: invoice,
      commitment_id_fk: commitmentId,
      fiscal_year: year,
      amount,
      source,
    });

  beforeEach(async () => {
    await resetTables(ds, [
      'invoice_commitment_shares',
      'budget_commitment_contracts',
      'budget_commitment_years',
      'budget_commitments',
      'budget_chapters',
      'invoice_lines',
      'invoices',
      'contracts',
      'consip_agreement',
      'third_parties',
    ]);
    reconciled = [];
    chapterA = await insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: '1000',
      article: 0,
      description: 'Luce',
    });
    chapterB = await insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: '2000',
      article: 1,
      description: 'Gas',
    });
    enel = await insertThirdParty(ds, { company_name: 'Enel' });
    other = await insertThirdParty(ds, {
      type: 'NATURAL',
      company_name: null,
      last_name: 'Rossi',
      first_name: 'Mario',
    });
    agreement = await insertConsipAgreement(ds, enel);
    k1 = await insertContract(ds, { supplier_id_fk: enel, consip_agreement_id: agreement });
    k2 = await insertContract(ds, { supplier_id_fk: enel });
    big = await commitment(
      {
        commitment_year: 2025,
        commitment_num: 10,
        commitment_sub: 1,
        budget_chapter_id_fk: chapterA,
        supplier_id_fk: enel,
        notes: 'Pluriennale',
      },
      { 2025: 1000, 2026: 500 },
      [k1, k2],
    );
    small = await commitment(
      {
        commitment_year: 2025,
        commitment_num: 3,
        commitment_sub: 1,
        budget_chapter_id_fk: chapterB,
        supplier_id_fk: other,
      },
      { 2025: 200 },
      [k2],
    );
    draft = await commitment({ budget_chapter_id_fk: chapterA }, { 2026: null }, []);
    gone = await commitment(
      {
        commitment_year: 2024,
        commitment_num: 1,
        commitment_sub: 1,
        budget_chapter_id_fk: chapterA,
        deleted: 1,
      },
      { 2024: 50 },
      [],
    );
    // Fatture inserite in ordine di data (F2 prima di F1).
    f2 = await insertInvoice(ds, { invoice_id: 'F2', invoice_date: '2025-02-01' });
    f1 = await insertInvoice(ds, { invoice_id: 'F1', invoice_date: '2025-03-10' });
    const rejected = await insertInvoice(ds, { invoice_id: 'FR', sdi_status: 'REJECTED' });
    const deleted = await insertInvoice(ds, { invoice_id: 'FD', deleted: 1 });
    await share(f1, big, 2025, 300);
    await share(f2, big, 2025, 100.5, 'MANUAL');
    await share(f2, big, 2026, 20, 'MANUAL');
    await share(rejected, big, 2025, 999);
    await share(deleted, big, 2025, 999);
    await share(f1, small, 2025, 50, 'ACCOUNTING');
  });

  describe('listRows / getRow', () => {
    it('righe con speso e rimanenza per annualità dalle sole fatture valide, in ordine', async () => {
      expect(await service.listRows({})).toStrictEqual([
        {
          id: draft,
          commitment_year: null,
          commitment_num: null,
          commitment_sub: null,
          label: expect.any(String),
          budget_chapter_id_fk: chapterA,
          chapter_label: '1000/0',
          chapter_description: 'Luce',
          fiscal_year: 2026,
          amount: null,
          spent: 0,
          remaining: null,
          years: [{ fiscal_year: 2026, amount: null, spent: 0, remaining: null }],
          supplier_id_fk: null,
          supplier_name: null,
          contract_ids: [],
          notes: null,
          source: 'MANUAL',
          deleted: false,
        },
        {
          id: small,
          commitment_year: 2025,
          commitment_num: 3,
          commitment_sub: 1,
          label: '2025/3/1',
          budget_chapter_id_fk: chapterB,
          chapter_label: '2000/1',
          chapter_description: 'Gas',
          fiscal_year: 2025,
          amount: 200,
          spent: 50,
          remaining: 150,
          years: [{ fiscal_year: 2025, amount: 200, spent: 50, remaining: 150 }],
          supplier_id_fk: other,
          supplier_name: 'Rossi Mario',
          contract_ids: [k2],
          notes: null,
          source: 'MANUAL',
          deleted: false,
        },
        {
          id: big,
          commitment_year: 2025,
          commitment_num: 10,
          commitment_sub: 1,
          label: '2025/10/1',
          budget_chapter_id_fk: chapterA,
          chapter_label: '1000/0',
          chapter_description: 'Luce',
          fiscal_year: 2025,
          amount: 1500,
          spent: 420.5,
          remaining: 1079.5,
          years: [
            { fiscal_year: 2025, amount: 1000, spent: 400.5, remaining: 599.5 },
            { fiscal_year: 2026, amount: 500, spent: 20, remaining: 480 },
          ],
          supplier_id_fk: enel,
          supplier_name: 'Enel',
          contract_ids: [k1, k2],
          notes: 'Pluriennale',
          source: 'MANUAL',
          deleted: false,
        },
      ]);
    });

    it('filtri: esercizio, capitolo, fornitore, contratto, convenzione, cancellati', async () => {
      const ids = async (search: Record<string, unknown>) =>
        (await service.listRows(search as never)).map((r) => r.id);
      expect(await ids({ fiscal_year: 2026 })).toEqual([draft, big]);
      expect(await ids({ budget_chapter_id: chapterB })).toEqual([small]);
      expect(await ids({ supplier_id: enel })).toEqual([big]);
      expect(await ids({ contract_id: k2 })).toEqual([small, big]);
      expect(await ids({ consip_agreement_id: agreement })).toEqual([big]);
      expect(await ids({ deleted: true })).toEqual([gone]);
      expect(await ids({ fiscal_year: 2025, contract_id: k2, supplier_id: other })).toEqual([
        small,
      ]);
    });

    it('getRow: riga singola, anche cancellata; inesistente = 400', async () => {
      expect((await service.getRow(big)).spent).toBe(420.5);
      expect((await service.getRow(gone)).deleted).toBe(true);
      await expect(service.getRow(99999)).rejects.toThrow('Impegno non trovato');
    });
  });

  it('invoices: quote delle fatture valide per data, con il progressivo', async () => {
    const rows = await service.invoices(big);
    expect(rows).toEqual([
      expect.objectContaining({
        invoice_id: f2,
        invoice_number: 'F2',
        invoice_date: '2025-02-01',
        amount: 100.5,
        fiscal_year: 2025,
        source: 'MANUAL',
        progressive: 100.5,
      }),
      expect.objectContaining({
        invoice_id: f2,
        amount: 20,
        fiscal_year: 2026,
        progressive: 120.5,
      }),
      expect.objectContaining({
        invoice_id: f1,
        invoice_number: 'F1',
        amount: 300,
        source: 'AUTO',
        progressive: 420.5,
      }),
    ]);
    expect(rows.every((r) => r.share_id > 0)).toBe(true);
  });

  it('update: annualità sostituite, quote a mano dell’esercizio tolto spostate, le altre no', async () => {
    await share(f1, big, 2026, 7, 'ACCOUNTING');
    await service.update(
      big,
      {
        years: [
          { fiscal_year: 2025, amount: 1200 },
          { fiscal_year: 2027, amount: 80 },
        ],
      } as never,
      SYSTEM_USER_ID,
    );
    expect(
      await ds.query(
        'SELECT fiscal_year, amount FROM budget_commitment_years WHERE commitment_id = ? ORDER BY fiscal_year',
        [big],
      ),
    ).toEqual([
      { fiscal_year: 2025, amount: '1200.00' },
      { fiscal_year: 2027, amount: '80.00' },
    ]);
    expect(
      await ds.query(
        'SELECT invoice_id_fk, fiscal_year, amount, source FROM invoice_commitment_shares WHERE commitment_id_fk = ? AND source <> ? ORDER BY id',
        [big, 'AUTO'],
      ),
    ).toEqual([
      { invoice_id_fk: f2, fiscal_year: 2025, amount: '100.50', source: 'MANUAL' },
      // 2026 tolto: la quota a mano va sull'annualità più vicina (a parità la precedente).
      { invoice_id_fk: f2, fiscal_year: 2025, amount: '20.00', source: 'MANUAL' },
      { invoice_id_fk: f1, fiscal_year: 2026, amount: '7.00', source: 'ACCOUNTING' },
    ]);
    expect(reconciled).toEqual([[k1, k2]]);
  });

  it('remove: bloccato dalle quote a mano su fatture valide, altrimenti cancellato', async () => {
    await expect(service.remove(big, SYSTEM_USER_ID)).rejects.toThrow(
      'Impegno scelto a mano su 1 fatture',
    );
    // Quota a mano solo su una fattura rifiutata: non blocca.
    const rejected = await insertInvoice(ds, { sdi_status: 'REJECTED' });
    await share(rejected, small, 2025, 5, 'MANUAL');
    await service.remove(small, SYSTEM_USER_ID);
    const [row] = await ds.query('SELECT deleted FROM budget_commitments WHERE id = ?', [small]);
    expect(Number(row.deleted)).toBe(1);
    expect(reconciled).toEqual([[k2]]);
  });
});
