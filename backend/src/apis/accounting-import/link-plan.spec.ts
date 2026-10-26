import { planCommitmentContracts, planUtilityChapters } from './link-plan';

describe('planCommitmentContracts', () => {
  const byCig = new Map([
    ['CIG1', [5]],
    ['CIG2', [6, 7]],
  ]);

  it('CIG con un solo contratto = collegato', () => {
    expect(
      planCommitmentContracts([{ id: 1, cig: 'CIG1', contractIds: [] }], byCig, new Map()),
    ).toEqual([{ commitmentId: 1, add: [5] }]);
  });

  it('CIG con due contratti = niente dal CIG', () => {
    expect(
      planCommitmentContracts([{ id: 1, cig: 'CIG2', contractIds: [] }], byCig, new Map()),
    ).toEqual([]);
  });

  it('contratti delle fatture pagate aggiunti', () => {
    expect(
      planCommitmentContracts(
        [{ id: 1, cig: 'CIG1', contractIds: [] }],
        byCig,
        new Map([[1, [9, 5]]]),
      ),
    ).toEqual([{ commitmentId: 1, add: [5, 9] }]);
  });

  it('collegamenti a mano mai tolti', () => {
    expect(
      planCommitmentContracts([{ id: 1, cig: null, contractIds: [3] }], byCig, new Map([[1, [9]]])),
    ).toEqual([{ commitmentId: 1, add: [9] }]);
  });

  it('già collegato = nessuna modifica', () => {
    expect(
      planCommitmentContracts(
        [{ id: 1, cig: 'CIG1', contractIds: [5, 9] }],
        byCig,
        new Map([[1, [9]]]),
      ),
    ).toEqual([]);
  });
});

describe('planUtilityChapters', () => {
  it('utenza con un solo capitolo nell ultimo esercizio = aggiornata', () => {
    expect(
      planUtilityChapters(
        [
          { utility_id: 1, fiscal_year: 2026, chapter_id: 7 },
          { utility_id: 1, fiscal_year: 2026, chapter_id: 7 },
        ],
        new Map([[1, 3]]),
      ),
    ).toEqual([{ utilityId: 1, chapterId: 7 }]);
  });

  it('due capitoli = invariata', () => {
    expect(
      planUtilityChapters(
        [
          { utility_id: 1, fiscal_year: 2026, chapter_id: 7 },
          { utility_id: 1, fiscal_year: 2026, chapter_id: 8 },
        ],
        new Map([[1, null]]),
      ),
    ).toEqual([]);
  });

  it('esercizi vecchi ignorati', () => {
    expect(
      planUtilityChapters(
        [
          { utility_id: 1, fiscal_year: 2025, chapter_id: 8 },
          { utility_id: 1, fiscal_year: 2026, chapter_id: 7 },
        ],
        new Map([[1, 7]]),
      ),
    ).toEqual([]);
  });
});
