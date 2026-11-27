import { EntityManager, ObjectType, SelectQueryBuilder } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SpendingDestination } from './entity/spending-destination.entity';

type Row = Record<string, unknown>;

const countOf =
  (entity: ObjectType<unknown>) =>
  (sub: SelectQueryBuilder<unknown>): SelectQueryBuilder<unknown> =>
    sub
      .select('COUNT(*)')
      .from(entity, 'x')
      .where('x.spending_destination_id = d.id AND x.deleted = 0');

// Immobili non cancellati senza destinazione, una riga per utenza con un
// capitolo che ha una destinazione (proposte per il primo popolamento).
export function suggestionRows(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder(Asset, 'a')
    .innerJoin('utility_assets', 'ua', 'ua.asset_id = a.id')
    .innerJoin(Utility, 'u', 'u.id = ua.utility_id AND u.deleted = 0')
    .innerJoin(BudgetChapter, 'b', 'b.id = u.budget_chapter_code_fk AND b.deleted = 0')
    .innerJoin(SpendingDestination, 'd', 'd.id = b.spending_destination_id AND d.deleted = 0')
    .select('a.id', 'asset_id')
    .addSelect('a.asset_name', 'label')
    .addSelect('d.id', 'destination_id')
    .where('a.deleted = 0 AND a.spending_destination_id IS NULL')
    .getRawMany();
}

export function assetDestinationsOf(m: EntityManager, ids: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder(Asset, 'a')
    .select('a.id', 'id')
    .addSelect('a.spending_destination_id', 'spending_destination_id')
    .where('a.id IN (:...ids) AND a.deleted = 0', { ids })
    .getRawMany();
}

export async function setAssetDestination(
  m: EntityManager,
  ids: number[],
  destinationId: number,
  userId: number,
): Promise<void> {
  await m
    .createQueryBuilder()
    .update(Asset)
    .set({ spending_destination_id: destinationId, updated_by_user_id: userId })
    .where('id IN (:...ids)', { ids })
    .execute();
}

// Immobili, impianti e capitoli con la destinazione, utenze sui suoi capitoli.
export function destinationUsage(m: EntityManager, ids?: number[]): Promise<Row[]> {
  const qb = m
    .createQueryBuilder(SpendingDestination, 'd')
    .select('d.id', 'id')
    .addSelect(countOf(Asset), 'assets')
    .addSelect(countOf(Plant), 'plants')
    .addSelect(countOf(BudgetChapter), 'chapters')
    .addSelect(
      (sub) =>
        sub
          .select('COUNT(*)')
          .from(Utility, 'u')
          .innerJoin(BudgetChapter, 'b', 'b.id = u.budget_chapter_code_fk')
          .where('b.spending_destination_id = d.id AND u.deleted = 0'),
      'utilities',
    )
    .where('d.deleted = 0');
  if (ids?.length) qb.andWhere('d.id IN (:...ids)', { ids });
  return qb.getRawMany();
}
