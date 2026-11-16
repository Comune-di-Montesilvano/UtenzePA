import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertContract,
  insertInvoice,
  insertInvoiceLine,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { CommitmentReconcileService } from './commitment-reconcile.service';
import { insertAutoShare } from './commitment-reconcile.sql';

// Riconciliazione delle quote automatiche su MySQL vero: fatture dei contratti,
// impegni (anche pluriennali) collegati, quote fisse, contratti che condividono
// un impegno, fatture escluse.

const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('CommitmentReconcileService (integrazione)', () => {
  let ds: DataSource;
  let service: CommitmentReconcileService;
  let reconciled: number[][];
  let supplier: number;
  let chapter: number;
  let seq = 0;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new CommitmentReconcileService(ds);
    service.onReconciled((ids) => reconciled.push(ids));
  });

  afterAll(() => ds.destroy());

  beforeEach(async () => {
    await resetTables(ds, [
      'invoice_commitment_shares',
      'budget_commitment_contracts',
      'budget_commitment_years',
      'budget_commitments',
      'budget_chapters',
      'invoice_lines',
      'invoices',
      'utilities',
      'contracts',
      'third_parties',
    ]);
    reconciled = [];
    supplier = await insertThirdParty(ds);
    chapter = await newChapter();
  });

  const newChapter = () =>
    insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: `C${++seq}`,
      article: 0,
      description: 'Capitolo di prova',
    });
  const contract = () => insertContract(ds, { supplier_id_fk: supplier });
  // Impegno con annualità { esercizio: importo } collegato ai contratti.
  async function commitment(
    num: number,
    years: Record<number, number | null>,
    contracts: number[],
    chapterId = chapter,
  ): Promise<number> {
    const id = await insert(ds, 'budget_commitments', {
      ...who,
      commitment_year: 2025,
      commitment_num: num,
      commitment_sub: 0,
      budget_chapter_id_fk: chapterId,
      supplier_id_fk: supplier,
    });
    for (const [year, amount] of Object.entries(years))
      await insert(ds, 'budget_commitment_years', { commitment_id: id, fiscal_year: year, amount });
    for (const c of contracts)
      await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id: c });
    return id;
  }
  // Fattura del contratto con righe [importo, inizio, fine] sull'utenza.
  async function invoice(
    contractId: number | null,
    lines: [number, string | null, string | null][],
    over: Record<string, unknown> = {},
    utility?: number,
  ): Promise<number> {
    const u = utility ?? (await insertUtility(ds, { budget_chapter_code_fk: chapter }));
    const id = await insertInvoice(ds, {
      supplier_id_fk: supplier,
      contratto_id_fk: contractId,
      invoice_date: '2025-06-15',
      update_date: '2025-01-01 00:00:00',
      ...over,
    });
    for (const [amount, start, end] of lines)
      await insertInvoiceLine(ds, id, amount, {
        utility_id_fk: u,
        period_start: start,
        period_end: end,
      });
    return id;
  }
  const share = (
    invoiceId: number,
    commitmentId: number,
    year: number,
    amount: number,
    source: string,
  ) =>
    insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: invoiceId,
      commitment_id_fk: commitmentId,
      fiscal_year: year,
      amount,
      source,
    });
  const shares = (): Promise<Record<string, unknown>[]> =>
    ds.query(
      'SELECT id, invoice_id_fk, commitment_id_fk, fiscal_year, amount, source FROM invoice_commitment_shares ' +
        'ORDER BY invoice_id_fk, source, id',
    );
  const brief = (rows: Record<string, unknown>[]) =>
    rows.map((r) => [
      Number(r.invoice_id_fk),
      Number(r.commitment_id_fk),
      Number(r.fiscal_year),
      Number(r.amount),
      r.source,
    ]);

  it('quota automatica sull’impegno del contratto e del capitolo, «Ultima modifica» della fattura invariata', async () => {
    const c = await contract();
    // Impegno cancellato con numero più basso: mai candidato.
    const gone = await commitment(0, { 2025: 1000 }, [c]);
    await ds.query('UPDATE budget_commitments SET deleted = 1 WHERE id = ?', [gone]);
    const k = await commitment(1, { 2025: 100 }, [c]);
    // Contratto con soli impegni, senza fatture: ricalcolato anche lui.
    const onlyCommitments = await contract();
    await commitment(2, { 2025: 100 }, [onlyCommitments]);
    const i = await invoice(c, [
      [30, '2025-01-01', '2025-01-31'],
      [20, '2025-02-01', '2025-02-28'],
    ]);
    await service.reconcileAll();
    expect(brief(await shares())).toEqual([[i, k, 2025, 50, 'AUTO']]);
    const [row] = await ds.query(
      "SELECT DATE_FORMAT(update_date, '%Y-%m-%d') AS d FROM invoices WHERE id = ?",
      [i],
    );
    expect(row.d).toBe('2025-01-01');
    expect(reconciled).toEqual([[c, onlyCommitments]]);
  });

  it('totale in testata al posto della somma delle righe; senza righe né totale nessuna quota', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 1000 }, [c]);
    const withTotal = await invoice(c, [[30, '2025-03-01', '2025-03-31']], { total_amount: 36.6 });
    const empty = await invoice(c, []);
    await service.reconcileAll();
    expect(brief(await shares())).toEqual([[withTotal, k, 2025, 36.6, 'AUTO']]);
    expect(empty).toBeGreaterThan(0);
  });

  it('pluriennale: annualità dalla competenza del periodo delle righe (anno con più giorni)', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 100, 2026: 100 }, [c]);
    const i2026 = await invoice(c, [[40, '2025-12-20', '2026-02-10']]);
    const i2025 = await invoice(c, [[10, null, null]], { invoice_date: '2025-05-01' });
    await service.reconcileAll();
    expect(brief(await shares())).toEqual([
      [i2026, k, 2026, 40, 'AUTO'],
      [i2025, k, 2025, 10, 'AUTO'],
    ]);
  });

  it('quote fisse (a mano o contabilità): niente quota automatica, quella residua tolta', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 100 }, [c]);
    const other = await commitment(2, { 2025: 100 }, [c]);
    const manual = await invoice(c, [[50, '2025-04-01', '2025-04-30']]);
    await share(manual, other, 2025, 50, 'MANUAL');
    await share(manual, k, 2025, 50, 'AUTO');
    // Quota della contabilità che esaurisce k (conta la quota, non il totale della
    // fattura): la fattura senza quote passa a other.
    const accounting = await invoice(c, [[30, '2025-05-01', '2025-05-31']]);
    await share(accounting, k, 2025, 100, 'ACCOUNTING');
    const plain = await invoice(c, [[10, '2025-06-01', '2025-06-30']]);
    await service.reconcileAll();
    expect(brief(await shares())).toEqual([
      [manual, other, 2025, 50, 'MANUAL'],
      [accounting, k, 2025, 100, 'ACCOUNTING'],
      [plain, other, 2025, 10, 'AUTO'],
    ]);
  });

  it('fattura senza contratto: quota automatica tolta; rifiutata, cancellata e compensata esclusa', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 1000 }, [c]);
    const orphan = await invoice(null, [[10, '2025-01-01', '2025-01-31']]);
    await share(orphan, k, 2025, 10, 'AUTO');
    const rejected = await invoice(c, [[11, '2025-01-01', '2025-01-31']], {
      sdi_status: 'REJECTED',
    });
    const deleted = await invoice(c, [[12, '2025-01-01', '2025-01-31']], { deleted: 1 });
    const compensated = await invoice(c, [[13, '2025-01-01', '2025-01-31']], {
      payment_status: 'COMPENSATED',
    });
    const valid = await invoice(c, [[14, '2025-01-01', '2025-01-31']]);
    await service.reconcileAll();
    expect(brief(await shares())).toEqual([[valid, k, 2025, 14, 'AUTO']]);
    expect([rejected, deleted, compensated].length).toBe(3);
  });

  it('quota già giusta: riga lasciata com’è (stesso id); quota sbagliata: sostituita', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 1000 }, [c]);
    const right = await invoice(c, [[10, '2025-01-01', '2025-01-31']]);
    const rightShare = await share(right, k, 2025, 10, 'AUTO');
    const wrong = await invoice(c, [[20, '2025-01-01', '2025-01-31']]);
    await share(wrong, k, 2025, 99, 'AUTO');
    await service.reconcileAll();
    const rows = await shares();
    expect(brief(rows)).toEqual([
      [right, k, 2025, 10, 'AUTO'],
      [wrong, k, 2025, 20, 'AUTO'],
    ]);
    expect(Number(rows[0].id)).toBe(rightShare);
  });

  it('contratti che condividono un impegno si ricalcolano insieme; quote a mano di contratti scollegati contano', async () => {
    const c1 = await contract();
    const c2 = await contract();
    const c3 = await contract();
    const shared = await commitment(1, { 2025: 100 }, [c1, c2]);
    const second = await commitment(2, { 2025: 100 }, [c2, c3]);
    const next = await commitment(3, { 2025: 100 }, [c1]);
    const i3 = await invoice(c3, [[5, '2025-01-01', '2025-01-31']]);
    // Fattura di un contratto senza impegni, divisa a mano sull'impegno condiviso.
    const loose = await contract();
    const looseInvoice = await invoice(loose, [[100, '2025-01-01', '2025-01-31']]);
    await share(looseInvoice, shared, 2025, 100, 'MANUAL');
    const i1 = await invoice(c1, [[30, '2025-02-01', '2025-02-28']]);
    await service.reconcileContracts([c1]);
    expect(reconciled).toEqual([[c1, c2, c3]]);
    // Condiviso esaurito dalla quota a mano: la fattura di c1 passa all'impegno successivo.
    expect(brief(await shares())).toEqual([
      [i3, second, 2025, 5, 'AUTO'],
      [looseInvoice, shared, 2025, 100, 'MANUAL'],
      [i1, next, 2025, 30, 'AUTO'],
    ]);
  });

  it('cambio di capitolo dell’utenza: ricalcolo dei contratti delle sue fatture', async () => {
    const c = await contract();
    const other = await newChapter();
    const k = await commitment(1, { 2025: 100 }, [c], other);
    const u = await insertUtility(ds, { budget_chapter_code_fk: chapter });
    const i = await invoice(c, [[25, '2025-01-01', '2025-01-31']], {}, u);
    await service.reconcileUtilities([u]);
    expect(await shares()).toEqual([]);
    await ds.query('UPDATE utilities SET budget_chapter_code_fk = ? WHERE id = ?', [other, u]);
    await service.reconcileUtilities([u]);
    expect(brief(await shares())).toEqual([[i, k, 2025, 25, 'AUTO']]);
    expect(reconciled).toEqual([[c], [c]]);
  });

  it('quota automatica non scritta se la fattura ha già una quota fissa (salvata nel frattempo)', async () => {
    const c = await contract();
    const k = await commitment(1, { 2025: 100 }, [c]);
    const fixed = await invoice(c, [[10, '2025-01-01', '2025-01-31']]);
    await share(fixed, k, 2025, 10, 'MANUAL');
    const free = await invoice(c, [[20, '2025-01-01', '2025-01-31']]);
    for (const id of [fixed, free])
      await insertAutoShare(ds.manager, id, { commitment_id: k, fiscal_year: 2025, amount: 1 });
    expect(brief(await shares())).toEqual([
      [fixed, k, 2025, 10, 'MANUAL'],
      [free, k, 2025, 1, 'AUTO'],
    ]);
  });
});
