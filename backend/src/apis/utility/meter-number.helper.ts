import { Repository } from 'typeorm';
import { Utility } from './entity/utility.entity';

// Normalizzazione unica della matricola: trim JS (spazi, tab, a capo, NBSP)
// + minuscole. TRIM di MySQL toglie solo gli spazi, quindi il confronto
// esatto si fa qui e non in SQL.
export function normalizeMeterNumber(meterNumber: string | null | undefined): string {
  return (meterNumber ?? '').trim().toLowerCase();
}

// Matricola contatore univoca tra utenze non cancellate. Check applicativo,
// non indice DB: soft delete e duplicati già presenti in produzione lo
// impediscono. La SQL fa solo da prefiltro (LIKE), l'uguaglianza vera è in JS.
export async function findMeterConflict(
  utilityRepo: Repository<Utility>,
  meterNumber: string | null | undefined,
  excludeUtilityId: number | null,
): Promise<Utility | null> {
  const normalized = normalizeMeterNumber(meterNumber);
  if (!normalized) return null;
  const qb = utilityRepo
    .createQueryBuilder('u')
    .where('u.deleted = 0')
    .andWhere('LOWER(u.meter_number) LIKE :meter', { meter: `%${normalized}%` });
  if (excludeUtilityId !== null) {
    qb.andWhere('u.id <> :excludeId', { excludeId: excludeUtilityId });
  }
  const candidates = await qb.getMany();
  return candidates.find((u) => normalizeMeterNumber(u.meter_number) === normalized) ?? null;
}
