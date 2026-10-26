import type { AccLiquidationRow } from './accounting-csv';
import { planShares, type CurrentShare } from './share-plan';

const liq = (key: string, patch: Partial<AccLiquidationRow> = {}): AccLiquidationRow => ({
  liquidation_key: key,
  commitment_year: 2026,
  commitment_num: 1,
  commitment_sub: 1,
  fiscal_year: 2026,
  sdi_identifier: null,
  invoice_number: 'FT1',
  invoice_date: '2026-03-01',
  invoice_total: 100,
  invoice_cig: null,
  supplier_vat: '00000000001',
  amount: 100,
  cancelled: false,
  ...patch,
});

const commitments = new Map([
  ['2026/1/1', 10],
  ['2026/2/1', 11],
]);

describe('planShares', () => {
  it('liquidazioni dello stesso impegno e anno sommate', () => {
    const plan = planShares(
      [liq('L1', { amount: 292.21 }), liq('L2', { amount: 2922.07 })],
      new Map([
        ['L1', 40],
        ['L2', 40],
      ]),
      commitments,
      [],
    );
    expect(plan).toEqual([{ invoiceId: 40, shares: [{ commitment_id_fk: 10, fiscal_year: 2026, amount: 3214.28 }] }]);
  });

  it('più impegni = più quote', () => {
    const plan = planShares(
      [liq('L1', { amount: 60 }), liq('L2', { commitment_num: 2, amount: 40 })],
      new Map([
        ['L1', 40],
        ['L2', 40],
      ]),
      commitments,
      [],
    );
    expect(plan).toEqual([
      {
        invoiceId: 40,
        shares: [
          { commitment_id_fk: 10, fiscal_year: 2026, amount: 60 },
          { commitment_id_fk: 11, fiscal_year: 2026, amount: 40 },
        ],
      },
    ]);
  });

  it('liquidazione su impegno fuori da UtenzePA = fattura saltata', () => {
    const plan = planShares(
      [liq('L1'), liq('L2', { commitment_num: 99 })],
      new Map([
        ['L1', 40],
        ['L2', 40],
      ]),
      commitments,
      [],
    );
    expect(plan).toEqual([]);
  });

  it('liquidazione annullata o senza fattura ignorata', () => {
    const plan = planShares([liq('L1', { cancelled: true }), liq('L2')], new Map([['L1', 40]]), commitments, []);
    expect(plan).toEqual([]);
  });

  it('fattura con ACCOUNTING e nessuna liquidazione valida = shares []', () => {
    const current: CurrentShare[] = [{ invoice_id_fk: 41, commitment_id_fk: 10, fiscal_year: 2026, amount: 5, source: 'ACCOUNTING' }];
    expect(planShares([], new Map(), commitments, current)).toEqual([{ invoiceId: 41, shares: [] }]);
  });

  it('quote già uguali = nessuna modifica', () => {
    const current: CurrentShare[] = [{ invoice_id_fk: 40, commitment_id_fk: 10, fiscal_year: 2026, amount: '100.00', source: 'ACCOUNTING' }];
    expect(planShares([liq('L1')], new Map([['L1', 40]]), commitments, current)).toEqual([]);
  });

  it('fattura con quote AUTO o MANUAL e liquidazioni = sostituite dalle ACCOUNTING', () => {
    const current: CurrentShare[] = [{ invoice_id_fk: 40, commitment_id_fk: 10, fiscal_year: 2026, amount: 100, source: 'MANUAL' }];
    expect(planShares([liq('L1')], new Map([['L1', 40]]), commitments, current)).toEqual([
      { invoiceId: 40, shares: [{ commitment_id_fk: 10, fiscal_year: 2026, amount: 100 }] },
    ]);
  });
});
