import { nextContract } from './next-contract';

const c = (id: number, supplierId: number, start: string | null, extra: object = {}) =>
  ({
    id,
    supplier_id_fk: supplierId,
    supplier: { id: supplierId },
    supply_start_date: start,
    closed: false,
    draft: false,
    deleted: false,
    ...extra,
  }) as never;

describe('nextContract', () => {
  const today = '2026-11-13';

  it('contratto di un altro fornitore che parte dopo oggi', () => {
    const current = c(1, 10, '2026-01-01');
    const next = c(2, 20, '2027-01-01');
    expect(nextContract([current, next], current, today)).toBe(next);
  });

  it('il più vicino tra più contratti futuri', () => {
    const current = c(1, 10, '2026-01-01');
    const later = c(3, 30, '2028-01-01');
    const sooner = c(2, 20, '2027-01-01');
    expect(nextContract([current, later, sooner], current, today)).toBe(sooner);
  });

  it('rinnovo con lo stesso fornitore: niente', () => {
    const current = c(1, 10, '2026-01-01');
    expect(nextContract([current, c(2, 10, '2027-01-01')], current, today)).toBeNull();
  });

  it('chiusi e cancellati non contano', () => {
    const current = c(1, 10, '2026-01-01');
    const others = [c(2, 20, '2027-01-01', { closed: true }), c(4, 20, '2027-01-01', { deleted: true })];
    expect(nextContract([current, ...others], current, today)).toBeNull();
  });

  it('ordine in bozza: conta (si prepara prima della scadenza del corrente)', () => {
    const current = c(1, 10, '2026-01-01');
    const draft = c(3, 20, '2027-01-01', { draft: true });
    expect(nextContract([current, draft], current, today)).toBe(draft);
  });

  it('contratto già partito o senza data: non è futuro', () => {
    const current = c(1, 10, '2026-01-01');
    expect(nextContract([current, c(2, 20, today), c(3, 20, null)], current, today)).toBeNull();
  });

  it('il corrente stesso futuro (nessun contratto in corso): niente', () => {
    const current = c(1, 10, '2027-01-01');
    expect(nextContract([current], current, today)).toBeNull();
  });

  it('senza contratto corrente: niente (il futuro sarebbe già il corrente)', () => {
    expect(nextContract([c(2, 20, '2027-01-01')], undefined, today)).toBeNull();
  });
});
