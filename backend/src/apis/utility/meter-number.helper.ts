import { Repository } from 'typeorm';
import { Utility } from './entity/utility.entity';

// Matricola contatore univoca tra utenze non cancellate (trim,
// case-insensitive). Check applicativo, non indice DB: soft delete e
// duplicati già presenti in produzione lo impediscono.
export async function findMeterConflict(
  utilityRepo: Repository<Utility>,
  meterNumber: string | null | undefined,
  excludeUtilityId: number | null,
): Promise<Utility | null> {
  const normalized = (meterNumber ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const qb = utilityRepo
    .createQueryBuilder('u')
    .where('u.deleted = 0')
    .andWhere('LOWER(TRIM(u.meter_number)) = :meter', { meter: normalized });
  if (excludeUtilityId !== null) {
    qb.andWhere('u.id <> :excludeId', { excludeId: excludeUtilityId });
  }
  return qb.getOne();
}
