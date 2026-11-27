import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ChapterSource } from './chapter-source.enum';

// Destinazioni dei collegamenti dell'utenza (solo non cancellati, null esclusi).
export interface DerivationUtility {
  id: number;
  hard_type: HardTypeEnum | null;
  chapter_id: number | null;
  source: ChapterSource;
  asset_destinations: number[];
  plant_destinations: number[];
  plant_asset_destinations: number[];
}

export interface DerivationChapter {
  id: number;
  destination_id: number;
  hard_type: HardTypeEnum | null;
}

export type DerivationReason = 'no_destination' | 'ambiguous' | 'no_chapter';

export interface DerivationResult {
  id: number;
  destination_id: number | null;
  chapter_id: number | null;
  source: ChapterSource;
  reason: DerivationReason | null;
}

// Destinazione dell'utenza: vince l'immobile; senza immobili con destinazione,
// l'impianto; senza, gli immobili degli impianti. Più destinazioni = ambigua.
function destinationOf(u: DerivationUtility): number | 'ambiguous' | null {
  for (const list of [u.asset_destinations, u.plant_destinations, u.plant_asset_destinations]) {
    const distinct = [...new Set(list)];
    if (distinct.length > 1) return 'ambiguous';
    if (distinct.length === 1) return distinct[0];
  }
  return null;
}

// Capitolo ideale di ogni utenza: destinazione + natura, poi destinazione con
// natura assente (tutte). Se non ricavabile resta il capitolo a mano.
export function deriveChapters(
  utilities: DerivationUtility[],
  chapters: DerivationChapter[],
): DerivationResult[] {
  const byKey = new Map(chapters.map((c) => [`${c.destination_id}|${c.hard_type ?? ''}`, c.id]));
  return utilities.map((u) => {
    const manual = (destination_id: number | null, reason: DerivationReason) => ({
      id: u.id,
      destination_id,
      chapter_id: u.chapter_id,
      source: ChapterSource.MANUAL,
      reason,
    });
    const d = destinationOf(u);
    if (d === null) return manual(null, 'no_destination');
    if (d === 'ambiguous') return manual(null, 'ambiguous');
    const chapter = (u.hard_type && byKey.get(`${d}|${u.hard_type}`)) ?? byKey.get(`${d}|`);
    if (chapter === undefined) return manual(d, 'no_chapter');
    return {
      id: u.id,
      destination_id: d,
      chapter_id: chapter,
      source: ChapterSource.DERIVED,
      reason: null,
    };
  });
}
