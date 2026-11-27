import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ChapterSource } from './chapter-source.enum';
import { DerivationChapter, DerivationUtility, deriveChapters } from './chapter-derivation';

const u = (over: Partial<DerivationUtility> = {}): DerivationUtility => ({
  id: 1,
  hard_type: HardTypeEnum.LIGHT,
  chapter_id: 99,
  source: ChapterSource.MANUAL,
  asset_destinations: [],
  plant_destinations: [],
  plant_asset_destinations: [],
  ...over,
});

const chapters: DerivationChapter[] = [
  { id: 10, destination_id: 1, hard_type: HardTypeEnum.LIGHT },
  { id: 11, destination_id: 1, hard_type: HardTypeEnum.GAS },
  { id: 30, destination_id: 3, hard_type: HardTypeEnum.LIGHT },
  { id: 40, destination_id: 4, hard_type: null },
];

const one = (x: DerivationUtility, ch = chapters) => deriveChapters([x], ch)[0];

describe('deriveChapters', () => {
  it('(a) immobile con destinazione e capitolo della natura: ricavato', () => {
    expect(one(u({ asset_destinations: [1] }))).toEqual({
      id: 1,
      destination_id: 1,
      chapter_id: 10,
      source: ChapterSource.DERIVED,
      reason: null,
    });
  });

  it('(b) immobili con destinazioni diverse: ambiguo, capitolo invariato', () => {
    expect(one(u({ asset_destinations: [1, 2] }))).toEqual({
      id: 1,
      destination_id: null,
      chapter_id: 99,
      source: ChapterSource.MANUAL,
      reason: 'ambiguous',
    });
  });

  it('(b2) stessa destinazione ripetuta su più immobili non è ambigua', () => {
    expect(one(u({ asset_destinations: [1, 1] })).chapter_id).toBe(10);
  });

  it('(c) senza immobili, impianto con destinazione', () => {
    expect(one(u({ plant_destinations: [3] })).chapter_id).toBe(30);
  });

  it('(d) immobile senza destinazione e impianto con destinazione', () => {
    expect(one(u({ asset_destinations: [], plant_destinations: [3] })).chapter_id).toBe(30);
  });

  it("(e) impianto senza destinazione su immobile con destinazione: quella dell'immobile", () => {
    expect(one(u({ plant_asset_destinations: [1] })).chapter_id).toBe(10);
  });

  it('(f) destinazione con solo il capitolo di tutte le nature', () => {
    expect(one(u({ asset_destinations: [4] }))).toMatchObject({
      chapter_id: 40,
      source: ChapterSource.DERIVED,
      destination_id: 4,
    });
  });

  it('(g) destinazione senza capitoli: manuale, no_chapter', () => {
    expect(one(u({ asset_destinations: [1] }), [])).toEqual({
      id: 1,
      destination_id: 1,
      chapter_id: 99,
      source: ChapterSource.MANUAL,
      reason: 'no_chapter',
    });
  });

  it("(h) immobile e impianto con destinazioni diverse: vince l'immobile", () => {
    expect(one(u({ asset_destinations: [1], plant_destinations: [3] })).chapter_id).toBe(10);
  });

  it('nessuna destinazione: manuale, no_destination', () => {
    expect(one(u())).toMatchObject({ source: ChapterSource.MANUAL, reason: 'no_destination' });
  });
});
