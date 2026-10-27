import { ShareApplierService } from './share-applier.service';

function setup(current: unknown[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM budget_commitments'))
        return [{ id: 10, commitment_year: 2026, commitment_num: 1, commitment_sub: 1 }];
      if (sql.includes('FROM invoice_commitment_shares')) return current;
      return [];
    }),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };
  const data = {
    liquidations: jest.fn(async () => [
      {
        liquidation_key: 'L1',
        commitment_year: 2026,
        commitment_num: 1,
        commitment_sub: 1,
        fiscal_year: 2026,
        sdi_identifier: null,
        invoice_number: 'FT1',
        invoice_date: '2026-03-01',
        invoice_total: 100,
        invoice_cig: null,
        supplier_vat: '1',
        amount: 100,
        cancelled: false,
      },
    ]),
  };
  const invoices = { matchedByKey: jest.fn(async () => new Map([['L1', 40]])) };
  const service = new ShareApplierService(dataSource as never, data as never, invoices as never);
  return { service, queries };
}

describe('ShareApplierService', () => {
  it('fattura abbinata: via tutte le quote, dentro le ACCOUNTING', async () => {
    const { service, queries } = setup([]);
    expect(await service.apply()).toEqual({ invoices: 1, cleared: 0 });
    expect(queries[0]).toEqual({
      sql: expect.stringMatching(
        /^DELETE FROM invoice_commitment_shares WHERE invoice_id_fk = \?$/,
      ),
      params: [40],
    });
    expect(queries[1].params).toEqual([[[40, 10, 2026, 100, 'ACCOUNTING']]]);
  });

  it('fattura con ACCOUNTING senza più liquidazioni: tolte solo le ACCOUNTING', async () => {
    const { service, queries } = setup([
      {
        invoice_id_fk: 41,
        commitment_id_fk: 10,
        fiscal_year: 2026,
        amount: '5.00',
        source: 'ACCOUNTING',
      },
      {
        invoice_id_fk: 40,
        commitment_id_fk: 10,
        fiscal_year: 2026,
        amount: '100.00',
        source: 'ACCOUNTING',
      },
    ]);
    expect(await service.apply()).toEqual({ invoices: 0, cleared: 1 });
    expect(queries).toEqual([
      { sql: expect.stringContaining("source = 'ACCOUNTING'"), params: [41] },
    ]);
  });
});
