import type { AccLiquidationRow } from './accounting-csv';
import { matchInvoices, type MatchableInvoice } from './invoice-match';

const liq = (key: string, patch: Partial<AccLiquidationRow> = {}): AccLiquidationRow => ({
  liquidation_key: key,
  commitment_year: 2026,
  commitment_num: 1,
  commitment_sub: 1,
  fiscal_year: 2026,
  sdi_identifier: null,
  invoice_number: 'FT/12',
  invoice_date: '2026-03-01',
  invoice_total: 100,
  invoice_cig: null,
  supplier_vat: '00000000001',
  amount: 100,
  cancelled: false,
  ...patch,
});

const inv = (id: number, patch: Partial<MatchableInvoice> = {}): MatchableInvoice => ({
  id,
  supplier_vat: '00000000001',
  invoice_number: 'FT/12',
  invoice_date: '2026-03-01',
  sdi_identifier: null,
  ...patch,
});

describe('matchInvoices', () => {
  it('sdi prima di P.IVA + numero + data', () => {
    const result = matchInvoices([liq('L1', { sdi_identifier: '999' })], [inv(1), inv(2, { sdi_identifier: '999', invoice_number: 'ALTRO' })]);
    expect(result).toEqual(new Map([['L1', 2]]));
  });

  it('numero con zeri e separatori diversi abbinato', () => {
    const result = matchInvoices([liq('L1', { invoice_number: '0012-A' })], [inv(5, { invoice_number: '12/a' })]);
    expect(result).toEqual(new Map([['L1', 5]]));
  });

  it('data o fornitore diversi = nessun abbinamento', () => {
    const result = matchInvoices(
      [liq('L1', { invoice_date: '2026-03-02' }), liq('L2', { supplier_vat: '00000000002' })],
      [inv(1)],
    );
    expect(result.size).toBe(0);
  });
});
