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
