import type { AccCommitmentRow } from './accounting-csv';
import { planCommitments, type CurrentCommitment } from './commitment-plan';
import { RecordSource } from './record-source.enum';

const row = (num: number, fiscal_year: number, patch: Partial<AccCommitmentRow> = {}): AccCommitmentRow => ({
  commitment_year: 2026,
  commitment_num: num,
  commitment_sub: 1,
  fiscal_year,
  chapter: '100',
  article: 0,
  supplier_vat: '00000000001',
  amount: 100,
  cig: null,
  cancelled: false,
  description: null,
  ...patch,
});

const current = (id: number, num: number, patch: Partial<CurrentCommitment> = {}): CurrentCommitment => ({
  id,
  commitment_year: 2026,
  commitment_num: num,
  commitment_sub: 1,
  budget_chapter_id_fk: 7,
  supplier_id_fk: 3,
  source: RecordSource.ACCOUNTING,
  years: [{ fiscal_year: 2026, amount: 100, source: RecordSource.ACCOUNTING }],
  ...patch,
});

const chapters = new Map([
  ['100/0', 7],
  ['200/0', 8],
]);
const suppliers = new Map([['00000000001', 3]]);
const scopeOf = (...nums: number[]) => new Set(nums.map((n) => `2026/${n}/1`));

describe('planCommitments', () => {
  it('più righe con lo stesso numero = un impegno con più annualità', () => {
    const changes = planCommitments(
      [row(1, 2026), row(1, 2027, { amount: 50 })],
      scopeOf(1),
      new Set([2026, 2027]),
      chapters,
      [],
      suppliers,
    );
    expect(changes).toEqual([
      {
        kind: 'create',
        number: { commitment_year: 2026, commitment_num: 1, commitment_sub: 1 },
        chapterId: 7,
        supplierId: 3,
        years: [
          { fiscal_year: 2026, amount: 100 },
          { fiscal_year: 2027, amount: 50 },
        ],
      },
    ]);
  });

  it('fornitore assente o sconosciuto = null', () => {
    const changes = planCommitments(
      [row(1, 2026, { supplier_vat: '99999999999' })],
      scopeOf(1),
      new Set([2026]),
      chapters,
      [],
      suppliers,
    );
    expect(changes[0]).toEqual(expect.objectContaining({ supplierId: null }));
  });

  it('impegno fuori perimetro o annullato ignorato', () => {
    expect(
      planCommitments([row(1, 2026), row(2, 2026, { cancelled: true })], scopeOf(2), new Set([2026]), chapters, [], suppliers),
    ).toEqual([]);
  });

  it('impegno MANUAL con lo stesso numero diventa ACCOUNTING con capitolo e annualità della contabilità', () => {
    const changes = planCommitments(
      [row(1, 2026, { chapter: '200', amount: 18500 })],
      scopeOf(1),
      new Set([2026]),
      chapters,
      [current(10, 1, { source: RecordSource.MANUAL, years: [{ fiscal_year: 2026, amount: 50000, source: RecordSource.MANUAL }] })],
      suppliers,
    );
    expect(changes).toEqual([
      {
        kind: 'update',
        id: 10,
        values: { budget_chapter_id_fk: 8, supplier_id_fk: 3, source: RecordSource.ACCOUNTING },
        fields: [
          { fieldName: 'budget_chapter_id_fk', oldValue: 7, newValue: 8 },
          { fieldName: 'source', oldValue: RecordSource.MANUAL, newValue: RecordSource.ACCOUNTING },
          { fieldName: 'years', oldValue: '2026: 50000.00', newValue: '2026: 18500.00' },
        ],
        years: { upsert: [{ fiscal_year: 2026, amount: 18500 }], delete: [] },
      },
    ]);
  });

  it('annualità in anno coperto assente dal file = cancellata, anno non coperto resta', () => {
    const changes = planCommitments(
      [row(1, 2026)],
      scopeOf(1),
      new Set([2026, 2027]),
      chapters,
      [
        current(10, 1, {
          years: [
            { fiscal_year: 2024, amount: 1, source: RecordSource.MANUAL },
            { fiscal_year: 2026, amount: 100, source: RecordSource.ACCOUNTING },
            { fiscal_year: 2027, amount: 5, source: RecordSource.MANUAL },
          ],
        }),
      ],
      suppliers,
    );
    expect(changes).toEqual([
      expect.objectContaining({
        kind: 'update',
        id: 10,
        years: { upsert: [], delete: [2027] },
      }),
    ]);
  });

  it('impegno senza riga valida nel file, con tutte le annualità in anni coperti = delete', () => {
    const changes = planCommitments(
      [row(1, 2026), row(2, 2026, { cancelled: true })],
      scopeOf(1),
      new Set([2026]),
      chapters,
      [current(10, 1), current(11, 2), current(12, 3, { source: RecordSource.MANUAL })],
      suppliers,
    );
    expect(changes).toEqual([
      { kind: 'delete', id: 11 },
      { kind: 'delete', id: 12 },
    ]);
  });

  it('impegno senza riga nel file con un anno non coperto: tolte solo le annualità coperte', () => {
    const changes = planCommitments(
      [row(1, 2026)],
      scopeOf(1),
      new Set([2026]),
      chapters,
      [
        current(10, 1),
        current(12, 3, {
          source: RecordSource.MANUAL,
          years: [
            { fiscal_year: 2022, amount: 1, source: RecordSource.MANUAL },
            { fiscal_year: 2026, amount: 1, source: RecordSource.MANUAL },
          ],
        }),
      ],
      suppliers,
    );
    expect(changes).toEqual([expect.objectContaining({ kind: 'update', id: 12, years: { upsert: [], delete: [2026] } })]);
  });

  it('ricarico identico = nessuna modifica', () => {
    expect(planCommitments([row(1, 2026)], scopeOf(1), new Set([2026]), chapters, [current(10, 1)], suppliers)).toEqual([]);
  });
});
