import fc from 'fast-check';
import { RetentionPolicy, selectBackupsToKeep } from './backup-retention';

// Backup con date tutte diverse (al minuto) tra il 2020 e il 2027.
const MINUTE = 60_000;
const START = Date.UTC(2020, 0, 1);
const backups = fc
  .uniqueArray(fc.integer({ min: 0, max: 8 * 365 * 24 * 60 }), { maxLength: 60 })
  .map((minutes) => minutes.map((m, i) => ({ id: i, createdAt: new Date(START + m * MINUTE) })));
const policy: fc.Arbitrary<RetentionPolicy> = fc.record({
  daily: fc.nat(10),
  weekly: fc.nat(6),
  monthly: fc.nat(14),
  yearly: fc.nat(3),
});
const ids = (s: Set<{ id: number }>) => [...s].map((b) => b.id).sort((a, b) => a - b);

describe('selectBackupsToKeep (proprietà)', () => {
  it('tiene sempre il backup più recente', () => {
    fc.assert(
      fc.property(backups.filter((b) => b.length > 0), policy, (bs, p) => {
        const newest = bs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
        expect(selectBackupsToKeep(bs, p).has(newest)).toBe(true);
      }),
    );
  });

  it('non tiene più di un backup per periodo di ogni scaglione, più il più recente', () => {
    fc.assert(
      fc.property(backups, policy, (bs, p) => {
        const kept = selectBackupsToKeep(bs, p);
        expect(kept.size).toBeLessThanOrEqual(Math.min(bs.length, 1 + p.daily + p.weekly + p.monthly + p.yearly));
      }),
    );
  });

  it('è idempotente: riapplicata ai backup tenuti li tiene tutti', () => {
    fc.assert(
      fc.property(backups, policy, (bs, p) => {
        const kept = selectBackupsToKeep(bs, p);
        expect(ids(selectBackupsToKeep([...kept], p))).toEqual(ids(kept));
      }),
    );
  });

  it("non dipende dall'ordine dei backup in ingresso", () => {
    fc.assert(
      fc.property(
        backups.chain((bs) => fc.tuple(fc.constant(bs), fc.shuffledSubarray(bs, { minLength: bs.length }))),
        policy,
        ([bs, shuffled], p) => {
          expect(ids(selectBackupsToKeep(shuffled, p))).toEqual(ids(selectBackupsToKeep(bs, p)));
        },
      ),
    );
  });
});
