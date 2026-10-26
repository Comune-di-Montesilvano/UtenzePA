import type { AccCommitmentRow, AccLiquidationRow } from './accounting-csv';
import { computeScope } from './scope';

const commitment = (num: number, chapter: string, cancelled = false): AccCommitmentRow => ({
  commitment_year: 2026,
  commitment_num: num,
  commitment_sub: 1,
  fiscal_year: 2026,
  chapter,
  article: 0,
  supplier_vat: null,
  amount: 100,
  cig: null,
  cancelled,
  description: null,
});

const liquidation = (num: number, vat: string, cancelled = false): AccLiquidationRow => ({
  liquidation_key: `L${num}${vat}`,
  commitment_year: 2026,
  commitment_num: num,
  commitment_sub: 1,
  fiscal_year: 2026,
  sdi_identifier: null,
  invoice_number: null,
  invoice_date: null,
  invoice_total: null,
  invoice_cig: null,
  supplier_vat: vat,
  amount: 10,
  cancelled,
});

describe('computeScope', () => {
  const suppliers = new Set(['00000000001']);

  it('capitolo esistente in perimetro anche senza liquidazioni', () => {
    const scope = computeScope({ commitments: [commitment(1, '100')], liquidations: [] }, suppliers, [
      { chapter_code: '100', article: 0 },
    ]);
    expect([...scope.chapterKeys]).toEqual(['100/0']);
    expect([...scope.commitmentKeys]).toEqual(['2026/1/1']);
  });

  it('capitolo nuovo entra solo con una liquidazione verso un fornitore del perimetro', () => {
    const acc = {
      commitments: [commitment(1, '200'), commitment(2, '300')],
      liquidations: [liquidation(1, '00000000001'), liquidation(2, '99999999999')],
    };
    const scope = computeScope(acc, suppliers, []);
    expect([...scope.chapterKeys]).toEqual(['200/0']);
    expect([...scope.commitmentKeys]).toEqual(['2026/1/1']);
  });

  it('liquidazione annullata non porta il capitolo', () => {
    const acc = { commitments: [commitment(1, '200')], liquidations: [liquidation(1, '00000000001', true)] };
    expect(computeScope(acc, suppliers, []).chapterKeys.size).toBe(0);
  });

  it('impegni = tutti quelli non annullati sui capitoli del perimetro', () => {
    const acc = {
      commitments: [commitment(1, '200'), commitment(3, '200'), commitment(4, '200', true)],
      liquidations: [liquidation(1, '00000000001')],
    };
    expect([...computeScope(acc, suppliers, []).commitmentKeys]).toEqual(['2026/1/1', '2026/3/1']);
  });
});
