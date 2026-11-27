import { EntityManager } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { SpendingDestination } from './entity/spending-destination.entity';
import { ChapterSource } from './chapter-source.enum';

type Row = Record<string, unknown>;

// Utenze non cancellate con natura, capitolo e origine attuali.
export function derivationUtilities(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder(Utility, 'u')
    .leftJoin(UtilityType, 't', 't.id = u.utility_type_id_fk')
    .select('u.id', 'id')
    .addSelect('t.hard_type', 'hard_type')
    .addSelect('u.budget_chapter_code_fk', 'chapter_id')
    .addSelect('u.chapter_source', 'source')
    .where('u.deleted = 0')
    .getRawMany();
}

// Destinazioni (non cancellate) degli immobili collegati alle utenze.
export function assetDestinations(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .from('utility_assets', 'ua')
    .innerJoin(Asset, 'a', 'a.id = ua.asset_id AND a.deleted = 0')
    .innerJoin(SpendingDestination, 'd', 'd.id = a.spending_destination_id AND d.deleted = 0')
    .select('ua.utility_id', 'utility_id')
    .addSelect('d.id', 'destination_id')
    .getRawMany();
}

// Destinazioni proprie degli impianti collegati alle utenze.
export function plantDestinations(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .from('utility_plants', 'up')
    .innerJoin(Plant, 'p', 'p.id = up.plant_id AND p.deleted = 0')
    .innerJoin(SpendingDestination, 'd', 'd.id = p.spending_destination_id AND d.deleted = 0')
    .select('up.utility_id', 'utility_id')
    .addSelect('d.id', 'destination_id')
    .getRawMany();
}

// Destinazioni degli immobili degli impianti collegati alle utenze.
export function plantAssetDestinations(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .from('utility_plants', 'up')
    .innerJoin(Plant, 'p', 'p.id = up.plant_id AND p.deleted = 0')
    .innerJoin('plant_assets', 'pa', 'pa.plant_id = p.id')
    .innerJoin(Asset, 'a', 'a.id = pa.asset_id AND a.deleted = 0')
    .innerJoin(SpendingDestination, 'd', 'd.id = a.spending_destination_id AND d.deleted = 0')
    .select('up.utility_id', 'utility_id')
    .addSelect('d.id', 'destination_id')
    .getRawMany();
}

// Capitoli non cancellati con una destinazione non cancellata.
export function destinationChapters(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder(BudgetChapter, 'b')
    .innerJoin(SpendingDestination, 'd', 'd.id = b.spending_destination_id AND d.deleted = 0')
    .select('b.id', 'id')
    .addSelect('b.spending_destination_id', 'destination_id')
    .addSelect('b.hard_type', 'hard_type')
    .where('b.deleted = 0')
    .getRawMany();
}

// Scrittura di sistema: "Ultima modifica" invariata.
export async function setDerivedChapter(
  m: EntityManager,
  utilityId: number,
  chapterId: number | null,
  source: ChapterSource,
): Promise<void> {
  await m.update(Utility, utilityId, {
    budget_chapter_code_fk: chapterId,
    chapter_source: source,
    updated_by_user_id: SYSTEM_USER_ID,
    update_date: () => '`update_date`',
  });
}
