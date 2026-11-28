import { DataSource } from 'typeorm';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AuditLog } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertContract,
  insertInvoice,
  insertInvoiceLine,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { AccountingDataService } from './accounting-data.service';
import { currentCommitments } from './accounting-import.queries';
import { AccountingImportService, type AccountingStep } from './accounting-import.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { ChapterApplierService } from './chapter-applier.service';
import { CommitmentApplierService } from './commitment-applier.service';
import { LinkApplierService } from './link-applier.service';
import { PaymentApplierService } from './payment-applier.service';
import { ShareApplierService } from './share-applier.service';

// Giro completo dell'import della contabilità su MySQL vero: CSV del formato neutro →
// tabelle acc_* → passi nell'ordine del modulo. Stato finale dell'applicazione e
// secondo caricamento identico (nessuna scrittura).

const TABLES = [
  'audit_logs',
  'acc_chapters',
  'acc_commitments',
  'acc_liquidations',
  'acc_credit_notes',
  'budget_commitment_contracts',
  'invoice_commitment_shares',
  'budget_commitment_years',
  'budget_commitments',
  'budget_chapter_spending',
  'budget_chapters',
  'sdi_messages',
  'invoice_lines',
  'invoices',
  'utilities',
  'contracts',
  'third_parties',
];

const csv = (rows: string[][]): Buffer => Buffer.from(rows.map((r) => r.join(';')).join('\n'));
const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('import della contabilità: giro completo (integrazione)', () => {
  let ds: DataSource;
  let service: AccountingImportService;

  beforeAll(async () => {
    ds = await itDataSource();
    const audit = new AuditLogService(
      ds.getRepository(AuditLog),
      ds.getRepository(Asset),
      ds.getRepository(Utility),
    );
    const data = new AccountingDataService(ds);
    const invoices = new AccountingInvoiceService(ds, data, audit);
    const chapters = new ChapterApplierService(ds, data, audit);
    const commitments = new CommitmentApplierService(ds, data, audit);
    const shares = new ShareApplierService(ds, data, invoices);
    const links = new LinkApplierService(ds, data, audit);
    const payments = new PaymentApplierService(ds, data, invoices);
    const steps: AccountingStep[] = [
      { name: 'chapters', apply: () => chapters.apply() },
      { name: 'commitments', apply: () => commitments.apply() },
      { name: 'invoices', apply: () => invoices.apply() },
      { name: 'shares', apply: () => shares.apply() },
      { name: 'links', apply: () => links.apply() },
      { name: 'payments', apply: (ctx) => payments.apply(ctx) },
    ];
    const states = {
      forcedOff: false,
      state: async () => ({ enabled: true, from_year: 2024 }),
      update: async () => undefined,
    };
    service = new AccountingImportService(
      ds,
      states as never,
      { reconcileAll: async () => undefined } as never,
      steps,
    );
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, TABLES));

  // Anagrafiche e dati a mano prima del giro.
  async function seed() {
    const supplierA = await insertThirdParty(ds, { vat_number: '01111111111' });
    const supplierB = await insertThirdParty(ds, { vat_number: '02222222222' });
    const contractA = await insertContract(ds, { supplier_id_fk: supplierA, cig_contract: 'CIGA' });
    await insertContract(ds, { supplier_id_fk: supplierB, cig_contract: 'CIGB', draft: 1 });
    const chapter1 = await insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: '1000',
      article: 0,
      description: 'Energia',
    });
    const spending2025 = await insert(ds, 'budget_chapter_spending', {
      ...who,
      budget_chapter_id_fk: chapter1,
      year: 2025,
      initial_budget: 90,
      adjusted_budget: 90,
      amount: 10,
    });
    const spending2024 = await insert(ds, 'budget_chapter_spending', {
      ...who,
      budget_chapter_id_fk: chapter1,
      year: 2024,
      initial_budget: 40,
    });
    // Capitolo del perimetro senza riga nel file: l'esercizio a mano si toglie.
    const chapter4 = await insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: '4000',
      article: 0,
      description: 'Acqua',
    });
    const spending4 = await insert(ds, 'budget_chapter_spending', {
      ...who,
      budget_chapter_id_fk: chapter4,
      year: 2025,
      initial_budget: 15,
    });
    // Impegno a mano assente dal file (esercizio coperto): cancellato.
    const gone = await insert(ds, 'budget_commitments', {
      ...who,
      commitment_year: 2025,
      commitment_num: 12,
      commitment_sub: 0,
      budget_chapter_id_fk: chapter1,
      supplier_id_fk: supplierA,
    });
    await insert(ds, 'budget_commitment_years', {
      commitment_id: gone,
      fiscal_year: 2025,
      amount: 80,
    });
    // Impegno a mano nel file con un'annualità in meno: annualità tolta.
    const partial = await insert(ds, 'budget_commitments', {
      ...who,
      commitment_year: 2024,
      commitment_num: 5,
      commitment_sub: 0,
      budget_chapter_id_fk: chapter1,
      supplier_id_fk: supplierA,
    });
    await insert(ds, 'budget_commitment_years', {
      commitment_id: partial,
      fiscal_year: 2024,
      amount: 50,
    });
    await insert(ds, 'budget_commitment_years', {
      commitment_id: partial,
      fiscal_year: 2025,
      amount: 70,
    });
    const utility = await insertUtility(ds);
    // Fattura pagata già in UtenzePA, senza IdentificativoSdI.
    const paid = await insertInvoice(ds, {
      supplier_id_fk: supplierA,
      invoice_id: 'F1',
      invoice_date: '2025-03-01',
      total_amount: 122,
      contratto_id_fk: contractA,
    });
    await insertInvoiceLine(ds, paid, 122, { utility_id_fk: utility });
    // Fattura divisa a mano tra l'impegno che sparisce e l'annualità tolta.
    const manual = await insertInvoice(ds, {
      supplier_id_fk: supplierA,
      invoice_id: 'F9',
      invoice_date: '2025-07-01',
      total_amount: 30,
    });
    await insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: manual,
      commitment_id_fk: gone,
      fiscal_year: 2025,
      amount: 10,
      source: 'MANUAL',
    });
    await insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: manual,
      commitment_id_fk: partial,
      fiscal_year: 2025,
      amount: 20,
      source: 'MANUAL',
    });
    // Quota a mano su un'annualità che resta: tolta anche questa (la fattura torna all'automatico).
    await insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: manual,
      commitment_id_fk: partial,
      fiscal_year: 2024,
      amount: 0,
      source: 'MANUAL',
    });
    // Fattura e nota di credito che la annulla.
    const cancelled = await insertInvoice(ds, {
      supplier_id_fk: supplierA,
      invoice_id: 'F3',
      invoice_date: '2025-08-01',
      total_amount: 50,
    });
    const note = await insertInvoice(ds, {
      supplier_id_fk: supplierA,
      invoice_id: 'NC1',
      invoice_date: '2025-08-10',
      total_amount: -50,
    });
    await insert(ds, 'sdi_messages', {
      uid_validity: 1,
      uid: 1,
      message_id: '<m1@pec>',
      file_name: 'IT01111111111_00001.xml',
      kind: 'INVOICE',
      status: 'PENDING',
      sdi_identifier: '111',
      received_at: '2025-03-02 10:00:00',
    });
    return {
      supplierA,
      contractA,
      chapter1,
      spending2025,
      spending2024,
      chapter4,
      spending4,
      gone,
      partial,
      utility,
      paid,
      manual,
      cancelled,
      note,
    };
  }

  const files = () => ({
    chapters: csv([
      ['year', 'chapter', 'article', 'description', 'initial_budget', 'adjusted_budget', 'spent'],
      ['2025', '1000', '0', 'Energia', '100', '120', '50'],
      ['2025', '3000', '0', 'Gas', '200', '200', ''],
      ['2023', '1000', '0', 'Energia', '1', '1', '1'],
    ]),
    commitments: csv([
      [
        'commitment_year',
        'commitment_num',
        'commitment_sub',
        'fiscal_year',
        'chapter',
        'article',
        'supplier_vat',
        'amount',
        'cig',
        'cancelled',
      ],
      ['2025', '10', '0', '2025', '1000', '0', '01111111111', '500', 'CIGA', '0'],
      ['2025', '10', '0', '2026', '1000', '0', '01111111111', '300', 'CIGA', '0'],
      ['2025', '11', '0', '2025', '3000', '0', '01111111111', '200', '', '0'],
      ['2024', '5', '0', '2024', '1000', '0', '01111111111', '60', '', '0'],
      ['2025', '13', '0', '2025', '1000', '0', '02222222222', '40', '', '0'],
      ['2025', '14', '0', '2025', '4000', '0', '01111111111', '5', '', '0'],
    ]),
    liquidations: csv([
      [
        'liquidation_key',
        'commitment_year',
        'commitment_num',
        'commitment_sub',
        'fiscal_year',
        'sdi_identifier',
        'invoice_number',
        'invoice_date',
        'invoice_total',
        'invoice_cig',
        'supplier_vat',
        'amount',
        'cancelled',
        'mandate_number',
        'mandate_date',
        'paid_date',
      ],
      [
        'L1',
        '2025',
        '10',
        '0',
        '2025',
        '111',
        'F1',
        '2025-03-01',
        '122',
        '',
        '01111111111',
        '122',
        '0',
        'M1',
        '2025-04-01',
        '2025-04-02',
      ],
      [
        'L2',
        '2025',
        '11',
        '0',
        '2025',
        '',
        'F2',
        '2025-05-01',
        '61',
        'CIGA',
        '01111111111',
        '61',
        '0',
        '',
        '',
        '',
      ],
      [
        'L3',
        '2025',
        '11',
        '0',
        '2025',
        '',
        'F4',
        '2025-05-02',
        '10',
        '',
        '01111111111',
        '10',
        '1',
        '',
        '',
        '',
      ],
      [
        'L4',
        '2025',
        '13',
        '0',
        '2025',
        '',
        'FB',
        '2025-05-03',
        '40',
        '',
        '02222222222',
        '40',
        '0',
        '',
        '',
        '',
      ],
    ]),
    credit_notes: csv([
      [
        'link_key',
        'fiscal_year',
        'amount',
        'supplier_vat',
        'note_number',
        'note_date',
        'note_total',
        'invoice_number',
        'invoice_date',
        'invoice_total',
      ],
      ['N1', '2025', '50', '01111111111', 'NC1', '2025-08-10', '-50', 'F3', '2025-08-01', '50'],
    ]),
  });

  // Stato dell'applicazione toccato dal giro (date di modifica comprese).
  async function snapshot() {
    const q = (sql: string) => ds.query(sql);
    return {
      chapters: await q(
        'SELECT id, chapter_code, article, description, source, deleted, update_date FROM budget_chapters ORDER BY id',
      ),
      spending: await q(
        'SELECT id, budget_chapter_id_fk, year, initial_budget, adjusted_budget, amount, source, deleted, update_date ' +
          'FROM budget_chapter_spending ORDER BY id',
      ),
      commitments: await q(
        'SELECT id, commitment_year, commitment_num, commitment_sub, budget_chapter_id_fk, supplier_id_fk, source, ' +
          'deleted, update_date FROM budget_commitments ORDER BY id',
      ),
      years: await q(
        'SELECT commitment_id, fiscal_year, amount, source FROM budget_commitment_years ORDER BY commitment_id, fiscal_year',
      ),
      shares: await q(
        'SELECT invoice_id_fk, commitment_id_fk, fiscal_year, amount, source FROM invoice_commitment_shares ' +
          'ORDER BY invoice_id_fk, commitment_id_fk, fiscal_year',
      ),
      links: await q(
        'SELECT commitment_id, contract_id FROM budget_commitment_contracts ORDER BY commitment_id, contract_id',
      ),
      invoices: await q(
        "SELECT id, invoice_id, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, supplier_id_fk, total_amount, " +
          "sdi_identifier, sdi_status, contratto_id_fk, source, payment_status, DATE_FORMAT(paid_on, '%Y-%m-%d') AS paid_on, " +
          'update_date FROM invoices ORDER BY id',
      ),
      utilities: await q(
        'SELECT id, budget_chapter_code_fk, update_date FROM utilities ORDER BY id',
      ),
      liquidations: await q(
        'SELECT liquidation_key, invoice_id_fk FROM acc_liquidations ORDER BY liquidation_key',
      ),
      audits: await q(
        'SELECT entity_name, action, COUNT(*) AS n FROM audit_logs GROUP BY entity_name, action ORDER BY entity_name, action',
      ),
    };
  }

  // Stato leggibile per chiavi naturali (codici, numeri d'impegno, CIG, numeri di fattura).
  async function state() {
    const q = (sql: string) => ds.query(sql);
    const num = "CONCAT(bc.commitment_year, '/', bc.commitment_num, '/', bc.commitment_sub)";
    return {
      chapters: await q(
        'SELECT chapter_code, description, source, deleted FROM budget_chapters ORDER BY chapter_code',
      ),
      spending: await q(
        'SELECT c.chapter_code, s.year, s.initial_budget, s.adjusted_budget, s.amount, s.source, s.deleted ' +
          'FROM budget_chapter_spending s JOIN budget_chapters c ON c.id = s.budget_chapter_id_fk ' +
          'ORDER BY c.chapter_code, s.year',
      ),
      commitments: await q(
        `SELECT ${num} AS num, c.chapter_code, t.vat_number, bc.source, bc.deleted FROM budget_commitments bc ` +
          'JOIN budget_chapters c ON c.id = bc.budget_chapter_id_fk JOIN third_parties t ON t.id = bc.supplier_id_fk ' +
          'ORDER BY bc.commitment_year, bc.commitment_num',
      ),
      years: await q(
        `SELECT ${num} AS num, y.fiscal_year, y.amount, y.source FROM budget_commitment_years y ` +
          'JOIN budget_commitments bc ON bc.id = y.commitment_id ' +
          'ORDER BY bc.commitment_year, bc.commitment_num, y.fiscal_year',
      ),
      shares: await q(
        `SELECT i.invoice_id, ${num} AS num, s.fiscal_year, s.amount, s.source FROM invoice_commitment_shares s ` +
          'JOIN invoices i ON i.id = s.invoice_id_fk JOIN budget_commitments bc ON bc.id = s.commitment_id_fk ' +
          'ORDER BY i.invoice_id, num',
      ),
      links: await q(
        `SELECT ${num} AS num, c.cig_contract FROM budget_commitment_contracts l ` +
          'JOIN budget_commitments bc ON bc.id = l.commitment_id JOIN contracts c ON c.id = l.contract_id ORDER BY num',
      ),
      invoices: await q(
        'SELECT i.invoice_id, i.sdi_identifier, i.sdi_status, c.cig_contract, i.source, i.payment_status, ' +
          "DATE_FORMAT(i.paid_on, '%Y-%m-%d') AS paid_on FROM invoices i " +
          'LEFT JOIN contracts c ON c.id = i.contratto_id_fk ORDER BY i.invoice_id',
      ),
      utilityChapters: await q(
        'SELECT c.chapter_code FROM utilities u LEFT JOIN budget_chapters c ON c.id = u.budget_chapter_code_fk',
      ),
      liquidations: await q(
        'SELECT l.liquidation_key, i.invoice_id FROM acc_liquidations l ' +
          'LEFT JOIN invoices i ON i.id = l.invoice_id_fk ORDER BY l.liquidation_key',
      ),
      audits: await q(
        'SELECT entity_name, action, COUNT(*) AS n FROM audit_logs GROUP BY entity_name, action ' +
          'ORDER BY entity_name, action',
      ),
    };
  }

  it('primo giro: applicazione allineata alla contabilità; secondo giro identico: nessuna scrittura', async () => {
    await seed();
    const first = await service.run(files());
    // Righe prima dell'anno di partenza (2023) scartate.
    expect(first.loaded).toEqual({ chapters: 2, commitments: 6, liquidations: 4, credit_notes: 1 });
    expect(first.steps).toEqual({
      chapters: { chaptersCreated: 1, created: 1, updated: 1, deleted: 1 },
      commitments: { created: 4, updated: 1, deleted: 1 },
      invoices: { created: 1, sdiCompleted: 1 },
      shares: { invoices: 2, cleared: 0 },
      links: { contractsLinked: 2 },
      payments: { linked: 2, changed: 5 },
    });
    expect((await service.getStatus()).counts).toEqual({
      chapters: 2,
      commitments: 6,
      liquidations: 4,
      credit_notes: 1,
    });

    const s = await state();
    const row = (o: Record<string, unknown>) => expect.objectContaining(o);
    expect(s.chapters).toEqual([
      { chapter_code: '1000', description: 'Energia', source: 'MANUAL', deleted: 0 },
      { chapter_code: '3000', description: 'Gas', source: 'ACCOUNTING', deleted: 0 },
      { chapter_code: '4000', description: 'Acqua', source: 'MANUAL', deleted: 0 },
    ]);
    // 1000/2024: esercizio non nel file, resta; 4000/2025: a mano senza riga nel file, tolto.
    expect(s.spending).toEqual([
      row({
        chapter_code: '1000',
        year: 2024,
        initial_budget: '40.00',
        source: 'MANUAL',
        deleted: 0,
      }),
      {
        chapter_code: '1000',
        year: 2025,
        initial_budget: '100.00',
        adjusted_budget: '120.00',
        amount: '50.00',
        source: 'ACCOUNTING',
        deleted: 0,
      },
      // Spesa non indicata: liquidato valido degli impegni del capitolo (L2; L3 annullata esclusa).
      row({
        chapter_code: '3000',
        year: 2025,
        initial_budget: '200.00',
        amount: '61.00',
        source: 'ACCOUNTING',
      }),
      row({ chapter_code: '4000', year: 2025, source: 'MANUAL', deleted: 1 }),
    ]);
    // Fornitore fuori perimetro (02222222222): impegno creato lo stesso.
    const commitment = (
      num: string,
      chapter: string,
      vat: string,
      source: string,
      deleted = 0,
    ) => ({
      num,
      chapter_code: chapter,
      vat_number: vat,
      source,
      deleted,
    });
    expect(s.commitments).toEqual([
      commitment('2024/5/0', '1000', '01111111111', 'ACCOUNTING'),
      commitment('2025/10/0', '1000', '01111111111', 'ACCOUNTING'),
      commitment('2025/11/0', '3000', '01111111111', 'ACCOUNTING'),
      commitment('2025/12/0', '1000', '01111111111', 'MANUAL', 1),
      commitment('2025/13/0', '1000', '02222222222', 'ACCOUNTING'),
      commitment('2025/14/0', '4000', '01111111111', 'ACCOUNTING'),
    ]);
    // 2024/5/0: annualità 2024 aggiornata, 2025 (esercizio del file, assente) tolta.
    expect(s.years).toEqual([
      { num: '2024/5/0', fiscal_year: 2024, amount: '60.00', source: 'ACCOUNTING' },
      { num: '2025/10/0', fiscal_year: 2025, amount: '500.00', source: 'ACCOUNTING' },
      { num: '2025/10/0', fiscal_year: 2026, amount: '300.00', source: 'ACCOUNTING' },
      { num: '2025/11/0', fiscal_year: 2025, amount: '200.00', source: 'ACCOUNTING' },
      { num: '2025/12/0', fiscal_year: 2025, amount: '80.00', source: 'MANUAL' },
      { num: '2025/13/0', fiscal_year: 2025, amount: '40.00', source: 'ACCOUNTING' },
      { num: '2025/14/0', fiscal_year: 2025, amount: '5.00', source: 'ACCOUNTING' },
    ]);
    // F9 divisa a mano su impegno e annualità spariti: tutte le sue quote a mano tolte.
    expect(s.shares).toEqual([
      {
        invoice_id: 'F1',
        num: '2025/10/0',
        fiscal_year: 2025,
        amount: '122.00',
        source: 'ACCOUNTING',
      },
      {
        invoice_id: 'F2',
        num: '2025/11/0',
        fiscal_year: 2025,
        amount: '61.00',
        source: 'ACCOUNTING',
      },
    ]);
    // Dal CIG dell'impegno e dalle fatture pagate; la bozza con CIGB non conta.
    expect(s.links).toEqual([
      { num: '2025/10/0', cig_contract: 'CIGA' },
      { num: '2025/11/0', cig_contract: 'CIGA' },
    ]);
    // F2 creata dal registro (contratto dal CIG), FB no (fornitore fuori perimetro),
    // F4 no (liquidazione annullata); F1 completata con l'IdentificativoSdI e lo stato SDI.
    expect(s.invoices).toEqual([
      {
        invoice_id: 'F1',
        sdi_identifier: '111',
        sdi_status: 'RECEIVED',
        cig_contract: 'CIGA',
        source: 'MANUAL',
        payment_status: 'PAID',
        paid_on: '2025-04-02',
      },
      row({
        invoice_id: 'F2',
        cig_contract: 'CIGA',
        source: 'ACCOUNTING',
        payment_status: 'LIQUIDATED',
      }),
      row({ invoice_id: 'F3', payment_status: 'TO_LIQUIDATE' }),
      row({ invoice_id: 'F9', payment_status: 'TO_LIQUIDATE', paid_on: null }),
      row({ invoice_id: 'NC1', payment_status: 'COMPENSATED' }),
    ]);
    // Capitolo dell'utenza invariato: viene dalla destinazione, non dalle liquidazioni.
    expect(s.utilityChapters).toEqual([{ chapter_code: null }]);
    expect(s.liquidations).toEqual([
      { liquidation_key: 'L1', invoice_id: 'F1' },
      { liquidation_key: 'L2', invoice_id: 'F2' },
      { liquidation_key: 'L3', invoice_id: null },
      { liquidation_key: 'L4', invoice_id: null },
    ]);
    expect(s.audits).toEqual([
      { entity_name: 'budget_chapter_spending', action: 'CREATE', n: '1' },
      { entity_name: 'budget_chapter_spending', action: 'UPDATE', n: '4' },
      { entity_name: 'budget_chapter_spending', action: 'DELETE', n: '1' },
      { entity_name: 'budget_chapters', action: 'CREATE', n: '1' },
      { entity_name: 'budget_commitments', action: 'CREATE', n: '4' },
      { entity_name: 'budget_commitments', action: 'UPDATE', n: '4' },
      { entity_name: 'budget_commitments', action: 'DELETE', n: '1' },
      { entity_name: 'invoices', action: 'CREATE', n: '1' },
      { entity_name: 'invoices', action: 'UPDATE', n: '1' },
    ]);

    const before = await snapshot();
    const second = await service.run(files());
    expect(second.steps).toEqual({
      chapters: { chaptersCreated: 0, created: 0, updated: 0, deleted: 0 },
      commitments: { created: 0, updated: 0, deleted: 0 },
      invoices: { created: 0, sdiCompleted: 0 },
      shares: { invoices: 0, cleared: 0 },
      links: { contractsLinked: 0 },
      payments: { linked: 2, changed: 0 },
    });
    // Nessuna scrittura: stesse righe, stesse date di modifica, nessuna voce di log in più.
    expect(await snapshot()).toEqual(before);
  });

  it('impegni correnti: un preimpegno resta senza numero, non 0/0/0', async () => {
    const chapter = await insert(ds, 'budget_chapters', {
      ...who,
      chapter_code: '1000',
      article: 0,
      description: 'Energia',
    });
    const draft = await insert(ds, 'budget_commitments', {
      ...who,
      budget_chapter_id_fk: chapter,
    });
    const [row] = await currentCommitments(ds.manager);
    expect(row).toEqual(
      expect.objectContaining({
        id: draft,
        commitment_year: null,
        commitment_num: null,
        commitment_sub: null,
      }),
    );
  });
});
