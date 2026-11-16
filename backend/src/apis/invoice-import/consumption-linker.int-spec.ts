import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertInvoice,
  insertInvoiceLine,
  insertUtility,
} from '../../test/integration/fixtures';
import { ImportIssueType } from './enum/import-issue-type.enum';
import { ConsumptionLinker } from './consumption-linker.service';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('ConsumptionLinker (integrazione)', () => {
  let ds: DataSource;
  const linker = new ConsumptionLinker();

  beforeAll(async () => {
    ds = await itDataSource();
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, ['utility_consumptions', 'invoice_lines', 'invoices', 'utilities']),
  );

  const period = (
    utility: number,
    start: string,
    end: string,
    over: Record<string, unknown> = {},
  ) =>
    insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: utility,
      kind: 'PERIOD',
      source: 'INVOICE',
      period_start: start,
      period_end: end,
      consumption: 1,
      ...over,
    });
  const reading = (
    utility: number,
    date: string,
    value: number,
    over: Record<string, unknown> = {},
  ) =>
    insert(ds, 'utility_consumptions', {
      ...AUTHOR,
      utility_id_fk: utility,
      kind: 'READING',
      source: 'MANUAL',
      reading_date: date,
      reading_value: value,
      ...over,
    });
  const invoiceWithLine = async (utility: number, start = '2025-01-01', end = '2025-01-31') => {
    const invoice = await insertInvoice(ds);
    await insertInvoiceLine(ds, invoice, 50, {
      utility_id_fk: utility,
      period_start: start,
      period_end: end,
      consumption: 120,
    });
    return invoice;
  };
  const link = (invoice: number, previous: number[] = [], readings = new Map()) =>
    ds.transaction((m) =>
      linker.link(m, invoice, SYSTEM_USER_ID, previous, new Map(), new Set(), new Map(), readings),
    );
  const live = async (utility: number) =>
    (
      await ds.query(
        'SELECT id, kind, source, reading_value, is_estimated, invoice_id_fk, consumption FROM utility_consumptions WHERE utility_id_fk = ? AND deleted = 0 ORDER BY id',
        [utility],
      )
    ).map((r: Record<string, unknown>) => ({
      ...r,
      reading_value: r.reading_value === null ? null : Number(r.reading_value),
      consumption: r.consumption === null ? null : Number(r.consumption),
      is_estimated: Number(r.is_estimated),
    }));
  const lineConsumption = async (invoice: number) =>
    (
      await ds.query('SELECT consumption_id_fk AS id FROM invoice_lines WHERE invoice_id_fk = ?', [
        invoice,
      ])
    )[0].id;

  describe('consumi di periodo', () => {
    it('nuova rilevazione da fattura collegata alla riga; al giro dopo si riusa la propria', async () => {
      const u = await insertUtility(ds);
      const invoice = await invoiceWithLine(u);
      await link(invoice);
      const [created] = await live(u);
      expect(created).toEqual(
        expect.objectContaining({ kind: 'PERIOD', source: 'INVOICE', consumption: 120 }),
      );
      expect(await lineConsumption(invoice)).toBe(created.id);

      await link(invoice, [created.id]);
      expect((await live(u)).map((r: { id: number }) => r.id)).toEqual([created.id]);
    });

    it('adotta una rilevazione da fattura scollegata dello stesso periodo, non una già collegata', async () => {
      const u = await insertUtility(ds);
      const linkedElsewhere = await period(u, '2025-01-01', '2025-01-31');
      const other = await insertInvoice(ds);
      await insertInvoiceLine(ds, other, 10, { consumption_id_fk: linkedElsewhere });
      const free = await period(u, '2025-01-01', '2025-01-31');
      const invoice = await invoiceWithLine(u);
      await link(invoice);
      expect(await lineConsumption(invoice)).toBe(free);
    });

    it('periodo coperto da una rilevazione reale: segnalazione; stime e cancellate non coprono', async () => {
      const covered = await insertUtility(ds);
      await period(covered, '2024-12-15', '2025-02-15', { source: 'MANUAL' });
      const byEstimate = await insertUtility(ds);
      await period(byEstimate, '2024-12-15', '2025-02-15', { source: 'MANUAL', is_estimated: 1 });
      const byDeleted = await insertUtility(ds);
      await period(byDeleted, '2024-12-15', '2025-02-15', { source: 'MANUAL', deleted: 1 });

      const issues = async (u: number) =>
        (await link(await invoiceWithLine(u))).issues.map((i) => i.type);
      expect(await issues(covered)).toEqual([ImportIssueType.PERIOD_COVERED]);
      expect(await issues(byEstimate)).toEqual([]);
      expect(await issues(byDeleted)).toEqual([]);
    });
  });

  describe('letture del contatore', () => {
    it('stessa data: una stima diventa reale, una reale resta; decrescenti non importate', async () => {
      const u = await insertUtility(ds);
      const estimate = await reading(u, '2025-01-31', 90, { is_estimated: 1 });
      const real = await reading(u, '2025-02-28', 150);
      const invoice = await insertInvoice(ds);
      const result = await link(
        invoice,
        [],
        new Map([
          [
            u,
            [
              { date: '2025-01-31', value: 100, estimated: false },
              { date: '2025-02-28', value: 160, estimated: true },
              { date: '2025-03-31', value: 140, estimated: false },
              { date: '2025-04-30', value: 200, estimated: false },
            ],
          ],
        ]),
      );
      expect(result.issues.map((i) => [i.type, i.value])).toEqual([
        [ImportIssueType.READING_DECREASING, '140'],
      ]);
      const rows = await live(u);
      expect(
        rows.map((r: Record<string, unknown>) => [r.id, r.reading_value, r.is_estimated]),
      ).toEqual([
        [estimate, 100, 0],
        [real, 150, 0],
        [expect.any(Number), 200, 0],
      ]);
      expect(rows[2].invoice_id_fk).toBe(invoice);
    });

    it('cambio contatore (matricola diversa): la lettura riparte e si importa', async () => {
      const u = await insertUtility(ds);
      await reading(u, '2025-01-31', 900, { meter_number: 'OLD' });
      const invoice = await insertInvoice(ds);
      const result = await ds.transaction((m) =>
        linker.link(
          m,
          invoice,
          SYSTEM_USER_ID,
          [],
          new Map([[u, 'NEW']]),
          new Set(),
          new Map(),
          new Map([[u, [{ date: '2025-02-28', value: 5, estimated: false }]]]),
        ),
      );
      expect(result.issues).toEqual([]);
      expect((await live(u)).map((r: { reading_value: number }) => r.reading_value)).toEqual([
        900, 5,
      ]);
    });

    it('proprie letture non più in fattura: tolte', async () => {
      const u = await insertUtility(ds);
      const invoice = await insertInvoice(ds);
      await reading(u, '2025-01-31', 10, { invoice_id_fk: invoice, source: 'INVOICE' });
      await link(
        invoice,
        [],
        new Map([[u, [{ date: '2025-02-28', value: 20, estimated: false }]]]),
      );
      expect((await live(u)).map((r: { reading_value: number }) => r.reading_value)).toEqual([20]);
    });
  });

  it('unlink: tolte le rilevazioni da fattura collegate e le letture proprie, righe scollegate', async () => {
    const u = await insertUtility(ds);
    const invoice = await invoiceWithLine(u);
    await link(invoice, [], new Map([[u, [{ date: '2025-01-31', value: 20, estimated: false }]]]));
    // Rilevazione manuale collegata a mano a una riga: resta.
    const manual = await period(u, '2025-02-01', '2025-02-28', { source: 'MANUAL' });
    await insertInvoiceLine(ds, invoice, 5, { utility_id_fk: u, consumption_id_fk: manual });

    const utilities = await ds.transaction((m) => linker.unlink(m, invoice));
    expect(utilities).toEqual([u]);
    expect((await live(u)).map((r: { id: number }) => r.id)).toEqual([manual]);
    expect(
      await ds.query(
        'SELECT COUNT(*) AS n FROM invoice_lines WHERE invoice_id_fk = ? AND consumption_id_fk IS NOT NULL',
        [invoice],
      ),
    ).toEqual([{ n: '0' }]);
  });
});
