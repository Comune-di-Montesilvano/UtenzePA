import { allocate, AllocCommitment, AllocLine } from './commitment-allocation';

const c = (
  id: number,
  num: number | null,
  amount: number | null,
  year: number | null = num === null ? null : 2026,
): AllocCommitment => ({ id, year, num, sub: num === null ? null : 1, amount });

const line = (
  id: number,
  amount: number,
  date: string,
  auto = true,
  commitment_id: number | null = null,
): AllocLine => ({ id, amount, date, auto, commitment_id });

const ids = (m: Map<number, number | null>, lines: number[]) => lines.map((l) => m.get(l));

describe('allocate', () => {
  const A = c(10, 521, 100);
  const B = c(20, 1886, 50);

  it('consuma gli impegni in ordine di numero, riga intera', () => {
    const lines = [line(1, 60, '2026-01-10'), line(2, 60, '2026-02-10'), line(3, 60, '2026-03-10')];
    expect(ids(allocate([B, A], lines), [1, 2, 3])).toEqual([10, 10, 20]);
  });

  it('con tutti gli impegni esauriti va sull’ultimo', () => {
    const lines = [line(1, 100, '2026-01-10'), line(2, 50, '2026-02-10'), line(3, 5, '2026-03-10')];
    expect(ids(allocate([A, B], lines), [1, 2, 3])).toEqual([10, 20, 20]);
  });

  it('le righe manuali contano nella rimanenza ma non vengono restituite', () => {
    const lines = [line(9, 90, '2026-01-01', false, 10), line(1, 20, '2026-01-10'), line(2, 20, '2026-02-10')];
    const m = allocate([A, B], lines);
    expect(m.has(9)).toBe(false);
    expect(ids(m, [1, 2])).toEqual([10, 20]);
  });

  it('ordina per anno, numero e sub, non per id; senza numero dopo', () => {
    const old = c(30, 1700, 10, 2025);
    const none = c(5, null, 1000);
    const lines = [line(1, 10, '2026-01-10'), line(2, 100, '2026-01-11'), line(3, 5, '2026-01-12')];
    expect(ids(allocate([none, B, A, old], lines), [1, 2, 3])).toEqual([30, 10, 20]);
  });

  it('un impegno senza importo non si esaurisce mai', () => {
    const open = c(7, 100, null);
    const lines = [line(1, 1000, '2026-01-10'), line(2, 1000, '2026-02-10')];
    expect(ids(allocate([A, open], lines), [1, 2])).toEqual([7, 7]);
  });

  it('senza impegni le righe restano senza impegno', () => {
    expect(ids(allocate([], [line(1, 10, '2026-01-10')]), [1])).toEqual([null]);
  });

  it('un impegno condiviso da due contratti ha una sola rimanenza', () => {
    const shared = { ...c(10, 521, 100), contract_ids: [1, 2], chapter: 7, fiscal_year: 2026 };
    const second = { ...c(20, 1886, 50), contract_ids: [2], chapter: 7, fiscal_year: 2026 };
    const lines = [
      { ...line(1, 100, '2026-01-10'), contract_id: 1, chapter: 7, year: 2026 },
      { ...line(2, 80, '2026-02-10'), contract_id: 2, chapter: 7, year: 2026 },
    ];
    expect(ids(allocate([shared, second], lines), [1, 2])).toEqual([10, 20]);
  });

  it('una riga sceglie solo tra gli impegni del suo contratto, capitolo ed esercizio', () => {
    const other = { ...c(10, 1, 100), contract_ids: [2], chapter: 7, fiscal_year: 2026 };
    const otherChapter = { ...c(20, 2, 100), contract_ids: [1], chapter: 8, fiscal_year: 2026 };
    const otherYear = { ...c(30, 3, 100), contract_ids: [1], chapter: 7, fiscal_year: 2025 };
    const right = { ...c(40, 4, 100), contract_ids: [1], chapter: 7, fiscal_year: 2026 };
    const lines = [{ ...line(1, 10, '2026-01-10'), contract_id: 1, chapter: 7, year: 2026 }];
    expect(ids(allocate([other, otherChapter, otherYear, right], lines), [1])).toEqual([40]);
  });

  it('riga senza utenza: un solo capitolo impegnato nell’anno, altrimenti nessun impegno', () => {
    const a = { ...c(10, 1, 100), contract_ids: [1], chapter: 7, fiscal_year: 2026 };
    const b = { ...c(20, 2, 100), contract_ids: [1], chapter: 8, fiscal_year: 2026 };
    const noUtility = { ...line(1, 10, '2026-01-10'), contract_id: 1, chapter: null, year: 2026 };
    expect(ids(allocate([a], [noUtility]), [1])).toEqual([10]);
    expect(ids(allocate([a, b], [noUtility]), [1])).toEqual([null]);
  });

  it('scorre le righe per data e poi per id', () => {
    const lines = [line(2, 60, '2026-01-10'), line(1, 60, '2026-01-10'), line(3, 60, '2026-01-05')];
    expect(ids(allocate([A, B], lines), [3, 1, 2])).toEqual([10, 10, 20]);
  });
});
