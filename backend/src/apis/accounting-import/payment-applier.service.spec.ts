import { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import { PaymentApplierService } from './payment-applier.service';
import * as q from './accounting-import.queries';

jest.mock('./accounting-import.queries');
const mq = jest.mocked(q);

describe('PaymentApplierService', () => {
  it('collega le liquidazioni e scrive solo le fatture che cambiano, senza toccare update_date', async () => {
    // Scritture registrate per nome (provate in accounting-import.int-spec.ts).
    const writes: [string, ...unknown[]][] = [];
    mq.clearLiquidationInvoices.mockImplementation(async () => {
      writes.push(['clearLiquidationInvoices']);
    });
    mq.setLiquidationInvoices.mockImplementation(async (_m, links) => {
      writes.push(['setLiquidationInvoices', links]);
    });
    mq.setPaymentStatus.mockImplementation(async (_m, ids, status, paidOn) => {
      writes.push(['setPaymentStatus', ids, status, paidOn]);
    });
    const manager = {};
    mq.paymentInvoices.mockResolvedValue([
      {
        id: 1,
        invoice_date: '2026-03-01',
        total_amount: '100.00',
        excluded: 0,
        payment_status: null,
        paid_on: null,
      },
      {
        id: 2,
        invoice_date: '2026-03-01',
        total_amount: '50.00',
        excluded: 0,
        payment_status: PaymentStatus.TO_LIQUIDATE,
        paid_on: null,
      },
    ]);
    const dataSource = {
      manager,
      transaction: jest.fn((fn: (m: typeof manager) => Promise<void>) => fn(manager)),
    };
    const data = {
      liquidations: jest.fn().mockResolvedValue([
        {
          liquidation_key: 'k1',
          amount: 100,
          cancelled: false,
          paid_date: '2026-04-01',
          paid_amount: 100,
        },
      ]),
    };
    const invoices = {
      matchedByKey: jest.fn().mockResolvedValue(new Map([['k1', 1]])),
      creditNoteLinks: jest.fn().mockResolvedValue([]),
    };
    const service = new PaymentApplierService(
      dataSource as never,
      data as never,
      invoices as never,
    );

    expect(await service.apply({ fromYear: 2025 })).toEqual({ linked: 1, changed: 1 });
    expect(writes).toEqual([
      ['clearLiquidationInvoices'],
      ['setLiquidationInvoices', [['k1', 1]]],
      ['setPaymentStatus', [1], PaymentStatus.PAID, '2026-04-01'],
    ]);
  });
});
