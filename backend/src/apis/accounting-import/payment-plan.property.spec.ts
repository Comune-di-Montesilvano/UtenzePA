import fc from 'fast-check';
import { PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import type { AccLiquidationRow } from './accounting-csv';
import { PaymentInvoice, planPayments } from './payment-plan';

const CURRENT_YEAR = 2026;
const date = fc
  .record({
    y: fc.integer({ min: 2019, max: 2026 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

// Fatture 1..n con stato iniziale casuale (anche già allineato), liquidazioni abbinate a una di loro.
const scenario = fc.integer({ min: 1, max: 8 }).chain((n) =>
  fc.record({
    invoices: fc.tuple(
      ...Array.from({ length: n }, (_, i) =>
        fc.record({
          id: fc.constant(i + 1),
          invoice_date: date,
          total_amount: fc.option(fc.integer({ min: -500, max: 5000 }), { nil: null }),
          excluded: fc.boolean(),
          payment_status: fc.option(fc.constantFrom(...Object.values(PaymentStatus)), {
            nil: null,
          }),
          paid_on: fc.option(date, { nil: null }),
        }),
      ),
    ),
    liquidations: fc.array(
      fc.record({
        invoice: fc.integer({ min: 1, max: n }),
        cancelled: fc.boolean(),
        mandate_date: fc.option(date, { nil: null }),
        paid_date: fc.option(date, { nil: null }),
      }),
      { maxLength: 12 },
    ),
    notes: fc.array(
      fc.record({
        amount: fc.integer({ min: -5000, max: -1 }),
        noteId: fc.integer({ min: 1, max: n }),
        invoiceId: fc.integer({ min: 1, max: n }),
      }),
      { maxLength: 3 },
    ),
    fromYear: fc.integer({ min: 2019, max: 2026 }),
  }),
);

type Scenario = {
  invoices: PaymentInvoice[];
  liquidations: {
    invoice: number;
    cancelled: boolean;
    mandate_date: string | null;
    paid_date: string | null;
  }[];
  notes: { amount: number; noteId: number; invoiceId: number }[];
  fromYear: number;
};

function inputs(s: Scenario, liquidations = s.liquidations) {
  const rows = liquidations.map(
    (l, i) =>
      ({
        liquidation_key: `L${i}`,
        amount: 100,
        cancelled: l.cancelled,
        mandate_date: l.mandate_date,
        paid_date: l.paid_date,
      }) as AccLiquidationRow,
  );
  const matched = new Map(liquidations.map((l, i) => [`L${i}`, l.invoice]));
  return [rows, matched] as const;
}

const plan = (s: Scenario, invoices = s.invoices, liquidations = s.liquidations) => {
  const [rows, matched] = inputs(s, liquidations);
  return planPayments(rows, matched, invoices, s.fromYear, CURRENT_YEAR, s.notes);
};

// Stato risultante di ogni fattura: la modifica proposta oppure quello che aveva.
function finalState(s: Scenario) {
  const changes = new Map(plan(s).map((c) => [c.id, c]));
  return s.invoices.map((inv) => {
    const c = changes.get(inv.id);
    return {
      ...inv,
      payment_status: c ? c.status : inv.payment_status,
      paid_on: c ? c.paidOn : inv.paid_on,
    };
  });
}

describe('planPayments (proprietà)', () => {
  it("fatture escluse o prima dell'anno di partenza: nessuno stato e nessuna data", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        for (const inv of finalState(s)) {
          if (inv.excluded || Number(inv.invoice_date.slice(0, 4)) < s.fromYear) {
            expect(inv.payment_status).toBeNull();
            expect(inv.paid_on).toBeNull();
          }
        }
      }),
    );
  });

  it('la data di pagamento c’è solo sulle fatture pagate', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        for (const inv of finalState(s)) {
          expect(inv.paid_on !== null).toBe(inv.payment_status === PaymentStatus.PAID);
        }
      }),
    );
  });

  it('è idempotente: applicate le modifiche, un secondo giro non ne propone altre', () => {
    fc.assert(fc.property(scenario, (s) => expect(plan(s, finalState(s))).toEqual([])));
  });

  it("non dipende dall'ordine delle liquidazioni", () => {
    fc.assert(
      fc.property(
        scenario.chain((s) =>
          fc.tuple(
            fc.constant(s),
            fc.shuffledSubarray(s.liquidations, { minLength: s.liquidations.length }),
          ),
        ),
        ([s, shuffled]) => {
          const byId = (cs: { id: number }[]) => [...cs].sort((a, b) => a.id - b.id);
          expect(byId(plan(s, s.invoices, shuffled))).toEqual(byId(plan(s)));
        },
      ),
    );
  });
});
