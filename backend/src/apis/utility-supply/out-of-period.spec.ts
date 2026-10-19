import { SupplyEventType } from './enum/supply-event-type.enum';
import { SupplyEventLike } from './supply-state';
import { outOfPeriod } from './out-of-period';

let seq = 0;
function ev(p: Partial<SupplyEventLike> & { type: SupplyEventType }): SupplyEventLike {
  seq += 1;
  return {
    id: seq,
    third_party_id_fk: null,
    requested_on: null,
    effective_on: null,
    date_unknown: false,
    cancelled_on: null,
    deleted: false,
    utilizer_grant_id_fk: null,
    create_date: '2026-01-01',
    ...p,
  };
}
const T = SupplyEventType;
const line = (period_start: string | null, period_end: string | null, invoice_date = '2026-01-15') => ({
  period_start,
  period_end,
  invoice_date,
});

describe('outOfPeriod', () => {
  describe('attiva da prima, cessata il 2025-07-07', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, effective_on: '2025-07-07' }),
    ];

    it('periodo entro 30 giorni dalla cessazione: non anomalo', () => {
      expect(outOfPeriod(line('2025-07-20', '2025-08-05'), events)).toBe(false);
    });

    it('periodo oltre la tolleranza: anomalo', () => {
      expect(outOfPeriod(line('2025-09-01', '2025-09-16'), events)).toBe(true);
    });

    it('riga senza periodo: conta la data della fattura', () => {
      expect(outOfPeriod(line(null, null, '2025-12-01'), events)).toBe(true);
    });

    it('periodo prima della cessazione: non anomalo', () => {
      expect(outOfPeriod(line('2025-05-01', '2025-06-30'), events)).toBe(false);
    });
  });

  it('attivazione e cessazione «data non nota»: stato non determinabile, mai anomalo', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, date_unknown: true }),
    ];
    expect(outOfPeriod(line(null, null, '2025-12-01'), events)).toBe(false);
  });

  it('cessazione «data non nota» seguita da attivazione datata: prima non determinabile', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, date_unknown: true }),
      ev({ type: T.ACTIVATION, effective_on: '2026-03-01' }),
    ];
    expect(outOfPeriod(line('2025-06-01', '2025-06-30'), events)).toBe(false);
  });

  it('cessazione datata dopo una cessazione «data non nota»: dopo la data è anomalo', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, date_unknown: true }),
      ev({ type: T.ACTIVATION, effective_on: '2025-01-01' }),
      ev({ type: T.CESSATION, effective_on: '2025-03-01' }),
    ];
    expect(outOfPeriod(line('2025-09-01', '2025-09-30'), events)).toBe(true);
  });

  describe('cessata il 2025-07-07, riattivata il 2026-01-10', () => {
    const events = [
      ev({ type: T.CESSATION, effective_on: '2025-07-07' }),
      ev({ type: T.ACTIVATION, effective_on: '2026-01-10' }),
    ];

    it('entro 30 giorni prima dell’attivazione: non anomalo', () => {
      expect(outOfPeriod(line('2025-12-20', '2026-01-09'), events)).toBe(false);
    });

    it('nel periodo di cessazione: anomalo', () => {
      expect(outOfPeriod(line('2025-10-01', '2025-10-31'), events)).toBe(true);
    });

    it('dopo la riattivazione: non anomalo', () => {
      expect(outOfPeriod(line('2026-02-01', '2026-02-28'), events)).toBe(false);
    });
  });

  it('righe annullate o cancellate non contano', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, effective_on: '2025-07-07', cancelled_on: '2025-08-01' }),
      ev({ type: T.CESSATION, effective_on: '2025-07-08', deleted: true }),
    ];
    expect(outOfPeriod(line('2025-10-01', '2025-10-31'), events)).toBe(false);
  });

  it('tolleranza configurabile', () => {
    const events = [
      ev({ type: T.ACTIVATION, date_unknown: true }),
      ev({ type: T.CESSATION, effective_on: '2025-07-07' }),
    ];
    expect(outOfPeriod(line('2025-07-20', '2025-08-05'), events, 0)).toBe(true);
  });
});
