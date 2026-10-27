import { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import { PaymentApplierService } from './payment-applier.service';

describe('PaymentApplierService', () => {
  it('collega le liquidazioni e scrive solo le fatture che cambiano, senza toccare update_date', async () => {
    const queries: [string, unknown[] | undefined][] = [];
    const manager = {
      query: jest.fn((sql: string, params?: unknown[]) => {
        queries.push([sql, params]);
        return Promise.resolve();
      }),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([
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
      ]),
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
    const invoices = { matchedByKey: jest.fn().mockResolvedValue(new Map([['k1', 1]])) };
    const service = new PaymentApplierService(
      dataSource as never,
      data as never,
      invoices as never,
    );

    expect(await service.apply({ fromYear: 2025 })).toEqual({ linked: 1, changed: 1 });
    expect(queries[0][0]).toBe('UPDATE acc_liquidations SET invoice_id_fk = NULL');
    expect(queries[1][1]).toEqual(['k1', 1, ['k1']]);
    expect(queries[2]).toEqual([
      'UPDATE invoices SET payment_status = ?, paid_on = ?, update_date = update_date WHERE id IN (?)',
      [PaymentStatus.PAID, '2026-04-01', [1]],
    ]);
    expect(queries).toHaveLength(3);
  });
});
