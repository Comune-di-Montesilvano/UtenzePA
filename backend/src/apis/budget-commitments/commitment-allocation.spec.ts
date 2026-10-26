import { allocate, AllocCommitment, AllocInvoice, AllocTarget } from './commitment-allocation';

const c = (
  id: number,
  num: number | null,
  amount: number | null,
  year: number | null = num === null ? null : 2026,
): AllocCommitment => ({ id, year, num, sub: num === null ? null : 1, amount });

const inv = (id: number, amount: number, date: string, extra: Partial<AllocInvoice> = {}): AllocInvoice => ({
  id,
  amount,
  date,
  fixed: [],
  ...extra,
});

const ids = (m: Map<number, AllocTarget | null>, invoices: number[]) => invoices.map((i) => m.get(i)?.id ?? m.get(i));

describe('allocate (per fattura)', () => {
  const A = c(10, 521, 100);
  const B = c(20, 1886, 50);

  it('un candidato: restituisce impegno e annualità', () => {
    const m = allocate([{ ...A, fiscal_year: 2026 }], [inv(1, 10, '2026-01-10')]);
    expect(m.get(1)).toEqual({ id: 10, fiscal_year: 2026 });
  });

  it('consuma gli impegni in ordine di numero, fattura intera', () => {
    const invoices = [inv(1, 60, '2026-01-10'), inv(2, 60, '2026-02-10'), inv(3, 60, '2026-03-10')];
    expect(ids(allocate([B, A], invoices), [1, 2, 3])).toEqual([10, 10, 20]);
  });

  it('con tutti gli impegni esauriti va sull’ultimo', () => {
    const invoices = [inv(1, 100, '2026-01-10'), inv(2, 50, '2026-02-10'), inv(3, 5, '2026-03-10')];
    expect(ids(allocate([A, B], invoices), [1, 2, 3])).toEqual([10, 20, 20]);
  });

  it('le quote fisse consumano la rimanenza e la fattura non è nel risultato', () => {
    const invoices = [
      inv(9, 90, '2026-01-01', { fixed: [{ commitment_id: 10, fiscal_year: 2026, amount: 90 }] }),
      inv(1, 20, '2026-01-10'),
      inv(2, 20, '2026-02-10'),
    ];
    const m = allocate([{ ...A, fiscal_year: 2026 }, B], invoices);
    expect(m.has(9)).toBe(false);
    expect(ids(m, [1, 2])).toEqual([10, 20]);
  });

  it('chapter null: capitoli diversi = nessuna, stesso capitolo = il primo', () => {
    const diff = [{ ...A, chapter: 1 }, { ...B, chapter: 2 }];
    expect(allocate(diff, [inv(1, 10, '2026-01-10', { chapter: null })]).get(1)).toBeNull();
    const same = [{ ...A, chapter: 1 }, { ...B, chapter: 1 }];
    expect(ids(allocate(same, [inv(1, 10, '2026-01-10', { chapter: null })]), [1])).toEqual([10]);
  });

  it('chapter 0 (utenza senza capitolo): nessuna', () => {
    const cs = [{ ...A, chapter: 1 }];
    expect(allocate(cs, [inv(1, 10, '2026-01-10', { chapter: 0 })]).get(1)).toBeNull();
  });

  it('esclude candidati di altro anno o altro contratto', () => {
    const cs = [
      { ...A, fiscal_year: 2025, contract_ids: [7] },
      { ...B, fiscal_year: 2026, contract_ids: [8] },
    ];
    expect(allocate(cs, [inv(1, 10, '2026-01-10', { year: 2026, contract_id: 7 })]).get(1)).toBeNull();
    expect(ids(allocate(cs, [inv(1, 10, '2026-01-10', { year: 2026, contract_id: 8 })]), [1])).toEqual([20]);
  });

  it('ordina per data poi id, a prescindere dall’input', () => {
    const invoices = [inv(3, 60, '2026-03-10'), inv(2, 60, '2026-01-10'), inv(1, 60, '2026-01-10')];
    expect(ids(allocate([A, B], invoices), [1, 2, 3])).toEqual([10, 10, 20]);
  });

  it('un’annualità senza importo non si esaurisce', () => {
    const invoices = [inv(1, 1000, '2026-01-10'), inv(2, 1000, '2026-02-10')];
    expect(ids(allocate([c(30, 1, null), B], invoices), [1, 2])).toEqual([30, 30]);
  });

  it('nota di credito: restituisce rimanenza allo stesso impegno', () => {
    const invoices = [inv(1, 100, '2026-01-10'), inv(2, -50, '2026-02-10'), inv(3, 40, '2026-03-10')];
    expect(ids(allocate([A], invoices), [1, 2, 3])).toEqual([10, 10, 10]);
  });
});
