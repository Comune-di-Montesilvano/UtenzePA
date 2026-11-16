import { DataSource } from 'typeorm';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import { insertInvoice, insertInvoiceLine, insertUtility } from '../../test/integration/fixtures';
import { SpendingService } from './spending.service';

describe('SpendingService (integrazione)', () => {
  let ds: DataSource;
  let service: SpendingService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new SpendingService(ds);
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, ['invoice_lines', 'invoices', 'utilities']));

  describe('forUtility', () => {
    let utilityId: number;

    beforeEach(async () => {
      utilityId = await insertUtility(ds);
      await insertInvoiceLine(ds, await insertInvoice(ds), 100, { utility_id_fk: utilityId });
      await insertInvoiceLine(ds, await insertInvoice(ds), 50, { utility_id_fk: utilityId });
      // Riga di un'altra utenza: mai nella spesa di questa.
      const other = await insertUtility(ds);
      await insertInvoiceLine(ds, await insertInvoice(ds), 999, { utility_id_fk: other });
    });

    it('somma le righe per anno di competenza e conta le fatture', async () => {
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });

    it('esclude le fatture rifiutate dallo SDI', async () => {
      const rejected = await insertInvoice(ds, { sdi_status: SdiStatus.REJECTED });
      await insertInvoiceLine(ds, rejected, 70, { utility_id_fk: utilityId });
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });

    it('esclude le fatture cancellate', async () => {
      const deleted = await insertInvoice(ds, { deleted: 1 });
      await insertInvoiceLine(ds, deleted, 30, { utility_id_fk: utilityId });
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });
  });
});
