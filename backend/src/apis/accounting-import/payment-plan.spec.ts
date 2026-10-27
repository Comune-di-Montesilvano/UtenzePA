import { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import type { AccLiquidationRow } from './accounting-csv';
import { isPaid, planPayments, type PaymentInvoice } from './payment-plan';

const liq = (key: string, over: Partial<AccLiquidationRow> = {}): AccLiquidationRow => ({
  liquidation_key: key,
  commitment_year: 2026,
  commitment_num: 1,
  commitment_sub: 1,
  fiscal_year: 2026,
  sdi_identifier: null,
  invoice_number: null,
  invoice_date: null,
  invoice_total: null,
  invoice_cig: null,
  supplier_vat: null,
  amount: 100,
  cancelled: false,
  liquidation_number: null,
  mandate_number: null,
  mandate_date: null,
  paid_date: null,
  paid_amount: null,
  ...over,
});

const inv = (id: number, over: Partial<PaymentInvoice> = {}): PaymentInvoice => ({
  id,
  invoice_date: '2026-03-01',
  total_amount: 100,
  excluded: false,
  payment_status: null,
  paid_on: null,
  ...over,
});

const paid = (date: string) => ({ paid_date: date, paid_amount: 100, mandate_number: '2026/5' });

describe('isPaid', () => {
  it('pagata con la data di pagamento, anche con importo pagato diverso', () => {
    expect(isPaid(liq('a', paid('2026-04-01')), 2026)).toBe(true);
    expect(isPaid(liq('a', { paid_date: '2026-04-01', paid_amount: 0 }), 2026)).toBe(true);
    expect(isPaid(liq('a', { mandate_number: '2026/5', mandate_date: '2026-04-01' }), 2026)).toBe(
      false,
    );
  });

  it('mandato di un esercizio chiuso senza quietanza = pagata', () => {
    expect(isPaid(liq('a', { mandate_number: '2023/5', mandate_date: '2023-04-01' }), 2026)).toBe(
      true,
    );
    expect(isPaid(liq('a'), 2026)).toBe(false);
  });
});

describe('planPayments', () => {
  it('da liquidare, liquidata e pagata con la data dell ultimo pagamento', () => {
    const matched = new Map([
      ['a', 2],
      ['b', 3],
      ['c', 3],
      ['d', 3],
    ]);
    const changes = planPayments(
      [
        liq('a', { mandate_number: '2026/5', mandate_date: '2026-04-01' }),
        liq('b', paid('2026-04-01')),
        liq('c', paid('2026-05-02')),
        liq('d', { cancelled: true }),
      ],
      matched,
      [inv(1), inv(2), inv(3)],
      2025,
      2026,
    );
    expect(changes).toEqual([
      { id: 1, status: PaymentStatus.TO_LIQUIDATE, paidOn: null },
      { id: 2, status: PaymentStatus.LIQUIDATED, paidOn: null },
      { id: 3, status: PaymentStatus.PAID, paidOn: '2026-05-02' },
    ]);
  });

  it('nessuno stato prima dell anno di partenza, su note di credito, cancellate o rifiutate', () => {
    const changes = planPayments(
      [],
      new Map(),
      [
        inv(1, { invoice_date: '2024-12-31', payment_status: PaymentStatus.TO_LIQUIDATE }),
        inv(2, { total_amount: -10 }),
        inv(3, { excluded: true, payment_status: PaymentStatus.PAID, paid_on: '2026-04-01' }),
      ],
      2025,
      2026,
    );
    expect(changes).toEqual([
      { id: 1, status: null, paidOn: null },
      { id: 3, status: null, paidOn: null },
    ]);
  });

  it('un secondo giro identico non cambia nulla', () => {
    const changes = planPayments(
      [liq('a', paid('2026-04-01'))],
      new Map([['a', 1]]),
      [inv(1, { payment_status: PaymentStatus.PAID, paid_on: '2026-04-01' })],
      2025,
      2026,
    );
    expect(changes).toEqual([]);
  });
});
