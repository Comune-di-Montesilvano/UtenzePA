import { toDay } from '@apis/utility-consumptions/consumption-calculator';
import { paidElsewhere } from './chapter-info';

const w = { start: toDay('2026-01-01'), end: toDay('2026-06-30') };
const line = (over: Record<string, unknown>) => ({
  amount: 100,
  period_start: null,
  period_end: null,
  invoice_date: '2026-02-10',
  chapter_label: '12331/2',
  share: 1,
  ...over,
});

describe('paidElsewhere', () => {
  it('raggruppa per capitolo con importo e mesi, il più pagato prima', () => {
    expect(
      paidElsewhere(
        [
          line({ period_start: '2026-01-01', period_end: '2026-03-31', amount: 90, share: 0.5 }),
          line({ chapter_label: '1210/0', invoice_date: '2026-05-04', amount: 80 }),
          line({ chapter_label: '1210/0', invoice_date: '2026-05-20', amount: 20 }),
        ],
        w,
      ),
    ).toEqual([
      { chapter_label: '1210/0', amount: 100, months: ['2026-05'] },
      { chapter_label: '12331/2', amount: 45, months: ['2026-01', '2026-02', '2026-03'] },
    ]);
  });

  it('solo la parte della riga dentro il periodo', () => {
    expect(
      paidElsewhere(
        [line({ period_start: '2025-12-01', period_end: '2026-01-31', amount: 62 })],
        w,
      ),
    ).toEqual([{ chapter_label: '12331/2', amount: 31, months: ['2026-01'] }]);
  });

  it('importi sotto il centesimo esclusi', () => {
    expect(paidElsewhere([line({ share: 0.00001 })], w)).toEqual([]);
  });
});
