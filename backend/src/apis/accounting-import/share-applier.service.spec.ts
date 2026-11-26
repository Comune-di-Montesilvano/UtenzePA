import { ShareApplierService } from './share-applier.service';
import * as q from './accounting-import.queries';

jest.mock('./accounting-import.queries');
const mq = jest.mocked(q);

function setup(current: unknown[]) {
  // Sostituzioni delle quote per fattura (scrittura provata in accounting-import.int-spec.ts).
  const replaced: { invoiceId: number; shares: unknown[] }[] = [];
  mq.replaceShares.mockImplementation(async (_m, invoiceId, shares) => {
    replaced.push({ invoiceId, shares });
  });
  mq.numberedCommitments.mockResolvedValue([
    { id: 10, commitment_year: 2026, commitment_num: 1, commitment_sub: 1 },
  ]);
  mq.allShares.mockResolvedValue(current as never);
  mq.numberedCommitmentYears.mockResolvedValue([{ commitment_id: 10, fiscal_year: 2026 }]);
  const manager = {};
  const dataSource = {
    manager,
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
  return { service, replaced };
}

describe('ShareApplierService', () => {
  it('fattura abbinata: via tutte le quote, dentro le ACCOUNTING', async () => {
    const { service, replaced } = setup([]);
    expect(await service.apply()).toEqual({ invoices: 1, cleared: 0 });
    expect(replaced).toEqual([
      { invoiceId: 40, shares: [{ commitment_id_fk: 10, fiscal_year: 2026, amount: 100 }] },
    ]);
  });

  it('fattura con ACCOUNTING senza più liquidazioni: tolte solo le ACCOUNTING', async () => {
    const { service, replaced } = setup([
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
    // Nessuna quota pianificata = tolte solo le ACCOUNTING (replaceShares con lista vuota).
    expect(replaced).toEqual([{ invoiceId: 41, shares: [] }]);
  });
});
