import { SdiStatus } from './enum/sdi-status.enum';
import { deriveSdiStatus, NOT_REJECTED_SQL, type SdiEvent } from './sdi-status';

const at = (day: number) => new Date(2026, 6, day);
const invoice: SdiEvent = { kind: 'INVOICE', outcome: null, at: at(1) };
const ec = (outcome: 'EC01' | 'EC02', day: number): SdiEvent => ({
  kind: 'EC',
  outcome,
  at: at(day),
});
const dt = (day: number): SdiEvent => ({ kind: 'DT', outcome: null, at: at(day) });
const se = (day: number): SdiEvent => ({ kind: 'SE', outcome: null, at: at(day) });

describe('deriveSdiStatus', () => {
  it.each<[string, SdiEvent[], SdiStatus | null, boolean]>([
    ['solo la fattura', [invoice], SdiStatus.RECEIVED, false],
    ['accettata', [invoice, ec('EC01', 3)], SdiStatus.ACCEPTED, false],
    ['rifiutata', [invoice, ec('EC02', 3)], SdiStatus.REJECTED, false],
    ['decorsi i termini', [invoice, dt(16)], SdiStatus.DEADLINE_PASSED, false],
    ['rifiuto scartato dallo SDI', [invoice, ec('EC02', 3), se(4)], SdiStatus.RECEIVED, true],
    [
      'nuovo esito dopo lo scarto',
      [invoice, ec('EC02', 3), se(4), ec('EC01', 5)],
      SdiStatus.ACCEPTED,
      false,
    ],
    [
      'scarto dopo la decorrenza',
      [invoice, dt(16), ec('EC02', 17), se(18)],
      SdiStatus.DEADLINE_PASSED,
      true,
    ],
    ['eventi fuori ordine', [ec('EC02', 3), se(4), invoice], SdiStatus.RECEIVED, true],
    ['nessuna fattura', [ec('EC01', 3)], null, false],
  ])('%s', (_label, events, status, outcomeDiscarded) => {
    expect(deriveSdiStatus(events)).toEqual({ status, outcomeDiscarded });
  });
});

describe('NOT_REJECTED_SQL', () => {
  it('lascia passare le fatture senza stato e quelle non rifiutate', () => {
    expect(NOT_REJECTED_SQL('i')).toBe("(i.sdi_status IS NULL OR i.sdi_status <> 'REJECTED')");
  });
});
