import fc from 'fast-check';
import { AllocCommitment, AllocInvoice, allocate } from './commitment-allocation';

// Annualità con id tutti diversi (un impegno pluriennale si prova negli esempi di commitment-allocation.spec.ts).
const commitments = fc
  .array(
    fc.record({
      year: fc.option(fc.integer({ min: 2024, max: 2026 }), { nil: null }),
      num: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
      sub: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
      amount: fc.option(fc.integer({ min: 0, max: 3000 }), { nil: null }),
      contract_ids: fc.subarray([1, 2], { minLength: 1 }),
      chapter: fc.constantFrom(1, 2),
      fiscal_year: fc.constantFrom(2025, 2026),
    }),
    { maxLength: 6 },
  )
  .map((cs): AllocCommitment[] => cs.map((c, i) => ({ id: i + 1, ...c })));

const invoices = (cs: AllocCommitment[]) =>
  fc
    .array(
      fc.record({
        date: fc.constantFrom('2025-01-10', '2025-03-01', '2025-03-01', '2026-02-20', '2026-07-01'),
        amount: fc.integer({ min: -300, max: 1500 }),
        contract_id: fc.constantFrom(1, 2),
        chapter: fc.constantFrom<number | null>(1, 2, 0, null),
        year: fc.constantFrom(2025, 2026),
        fixed: cs.length
          ? fc.option(
              fc.record({
                commitment: fc.integer({ min: 0, max: cs.length - 1 }),
                amount: fc.integer({ min: 1, max: 800 }),
              }),
              { nil: null, freq: 4 },
            )
          : fc.constant(null),
      }),
      { maxLength: 10 },
    )
    .map((is): AllocInvoice[] =>
      is.map(({ fixed, ...i }, n) => ({
        id: n + 1,
        ...i,
        fixed: fixed
          ? [{ commitment_id: cs[fixed.commitment].id, fiscal_year: cs[fixed.commitment].fiscal_year!, amount: fixed.amount }]
          : [],
      })),
    );

const scenario = commitments.chain((cs) => fc.tuple(fc.constant(cs), invoices(cs)));
const sorted = (m: Map<number, unknown>) => [...m.entries()].sort(([a], [b]) => a - b);

describe('allocate (proprietà)', () => {
  it('assegna un risultato a tutte e sole le fatture senza quote fisse', () => {
    fc.assert(
      fc.property(scenario, ([cs, is]) => {
        const result = allocate(cs, is);
        expect([...result.keys()].sort((a, b) => a - b)).toEqual(is.filter((i) => !i.fixed.length).map((i) => i.id));
      }),
    );
  });

  it("il target è un'annualità del contratto, dell'esercizio e del capitolo della fattura", () => {
    fc.assert(
      fc.property(scenario, ([cs, is]) => {
        const result = allocate(cs, is);
        for (const i of is.filter((x) => !x.fixed.length)) {
          const target = result.get(i.id);
          if (!target) continue;
          const c = cs.find((x) => x.id === target.id && x.fiscal_year === target.fiscal_year)!;
          expect(c).toBeDefined();
          expect(c.contract_ids).toContain(i.contract_id);
          expect(c.fiscal_year).toBe(i.year);
          if (i.chapter) expect(c.chapter).toBe(i.chapter);
        }
      }),
    );
  });

  it('utenza senza capitolo (chapter 0): nessuna quota', () => {
    fc.assert(
      fc.property(scenario, ([cs, is]) => {
        const result = allocate(cs, is);
        for (const i of is.filter((x) => !x.fixed.length && x.chapter === 0)) expect(result.get(i.id)).toBeNull();
      }),
    );
  });

  it('una fattura con candidati riceve sempre un target', () => {
    fc.assert(
      fc.property(scenario, ([cs, is]) => {
        const result = allocate(cs, is);
        for (const i of is.filter((x) => !x.fixed.length && x.chapter !== 0)) {
          const pool = cs.filter(
            (c) =>
              c.contract_ids!.includes(i.contract_id!) &&
              c.fiscal_year === i.year &&
              (i.chapter === null || c.chapter === i.chapter),
          );
          const mixed = i.chapter === null && new Set(pool.map((c) => c.chapter)).size > 1;
          if (pool.length && !mixed) expect(result.get(i.id)).not.toBeNull();
        }
      }),
    );
  });

  it("non dipende dall'ordine di annualità e fatture in ingresso", () => {
    fc.assert(
      fc.property(
        scenario.chain(([cs, is]) =>
          fc.tuple(
            fc.constant(cs),
            fc.constant(is),
            fc.shuffledSubarray(cs, { minLength: cs.length }),
            fc.shuffledSubarray(is, { minLength: is.length }),
          ),
        ),
        ([cs, is, cs2, is2]) => {
          expect(sorted(allocate(cs2, is2))).toEqual(sorted(allocate(cs, is)));
        },
      ),
    );
  });
});
