import { DataSource } from 'typeorm';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import { insert, insertInvoice } from '../../test/integration/fixtures';
import { Invoice } from './entity/invoice.entity';
import { InvoicesService } from './invoice.service';

describe('InvoicesService (integrazione): findPayments', () => {
  let ds: DataSource;
  let service: InvoicesService;
  let n = 0;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new InvoicesService(
      ds.getRepository(Invoice),
      {} as never,
      ds,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, ['acc_liquidations', 'invoices']));

  const liquidation = (invoiceId: number | null, over: Record<string, unknown> = {}) =>
    insert(ds, 'acc_liquidations', {
      liquidation_key: `IT-L-${++n}`,
      commitment_year: 2025,
      commitment_num: 12,
      commitment_sub: 0,
      fiscal_year: 2025,
      amount: 100,
      invoice_id_fk: invoiceId,
      ...over,
    });

  it('liquidazioni non annullate della fattura, in ordine di numero, con date AAAA-MM-GG', async () => {
    const invoice = await insertInvoice(ds);
    await liquidation(invoice, {
      liquidation_number: 'B2',
      amount: 40.5,
      mandate_number: 'M9',
      mandate_date: '2025-07-01',
      paid_date: '2025-07-10',
      paid_amount: 40.5,
    });
    await liquidation(invoice, { liquidation_number: 'A1', commitment_sub: 2 });
    await liquidation(invoice, { liquidation_number: 'C3', cancelled: 1 });
    await liquidation(await insertInvoice(ds), { liquidation_number: 'Z' });
    await liquidation(null, { liquidation_number: 'Y' });

    expect(await service.findPayments(invoice)).toStrictEqual([
      {
        liquidation_number: 'A1',
        commitment: commitmentLabel(2025, 12, 2),
        amount: 100,
        mandate_number: null,
        mandate_date: null,
        paid_date: null,
        paid_amount: null,
      },
      {
        liquidation_number: 'B2',
        commitment: commitmentLabel(2025, 12, 0),
        amount: 40.5,
        mandate_number: 'M9',
        mandate_date: '2025-07-01',
        paid_date: '2025-07-10',
        paid_amount: 40.5,
      },
    ]);
  });

  it('fattura senza liquidazioni: elenco vuoto', async () => {
    expect(await service.findPayments(await insertInvoice(ds))).toEqual([]);
  });
});
