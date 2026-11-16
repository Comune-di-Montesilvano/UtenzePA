import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { UtilityConsumption } from '@apis/utility-consumptions/entity/utility-consumption.entity';
import {
  ConsumptionKind,
  ConsumptionSource,
} from '@apis/utility-consumptions/enum/consumption-kind.enum';

// Letture del collegamento tra righe di fattura e rilevazioni dei consumi.
// Valori grezzi (date come le restituisce il driver): li normalizza il linker.

export interface OwnedRow {
  id: number;
  utility_id_fk: number;
  period_start: string;
  period_end: string;
}

const consumptions = (m: EntityManager, alias = 'c'): SelectQueryBuilder<UtilityConsumption> =>
  m.getRepository(UtilityConsumption).createQueryBuilder(alias);

// Rilevazioni non cancellate tra quelle date.
export function owned(m: EntityManager, ids: number[]): Promise<OwnedRow[]> {
  return consumptions(m)
    .select(['c.id AS id', 'c.utility_id_fk AS utility_id_fk'])
    .addSelect(['c.period_start AS period_start', 'c.period_end AS period_end'])
    .where('c.id IN (:...ids) AND c.deleted = 0', { ids })
    .getRawMany();
}

// Rilevazione di periodo da fattura sullo stesso periodo, non collegata a nessuna riga.
export async function adoptable(
  m: EntityManager,
  utilityId: number,
  start: string,
  end: string,
): Promise<number | null> {
  const row: { id: number } | undefined = await consumptions(m)
    .select('c.id', 'id')
    .where('c.utility_id_fk = :utilityId AND c.kind = :period AND c.source = :invoice', {
      utilityId,
      period: ConsumptionKind.PERIOD,
      invoice: ConsumptionSource.INVOICE,
    })
    .andWhere('c.deleted = 0 AND c.period_start = :start AND c.period_end = :end', { start, end })
    .andWhere('NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.consumption_id_fk = c.id)')
    .orderBy('c.id')
    .limit(1)
    .getRawOne();
  return row ? Number(row.id) : null;
}

// Rilevazione reale di periodo che si sovrappone, tranne quelle escluse. Come il
// calcolo dei consumi: una stima non copre il dato reale della fattura.
export async function covering(
  m: EntityManager,
  utilityId: number,
  start: string,
  end: string,
  exclude: number[],
): Promise<{ id: number; period_start: string; period_end: string } | null> {
  const row = await consumptions(m)
    .select(['c.id AS id', 'c.period_start AS period_start', 'c.period_end AS period_end'])
    .where('c.utility_id_fk = :utilityId AND c.kind = :period', {
      utilityId,
      period: ConsumptionKind.PERIOD,
    })
    .andWhere('c.deleted = 0 AND c.is_estimated = 0')
    .andWhere('c.period_start <= :end AND c.period_end >= :start', { start, end })
    .andWhere('c.id NOT IN (:...exclude)', { exclude })
    .orderBy('c.id')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Lettura dell'utenza a quella data.
export async function readingOn(
  m: EntityManager,
  utilityId: number,
  date: string,
): Promise<{ id: number; invoice_id_fk: number | null; is_estimated: number } | null> {
  const row = await consumptions(m)
    .select(['c.id AS id', 'c.invoice_id_fk AS invoice_id_fk', 'c.is_estimated AS is_estimated'])
    .where('c.utility_id_fk = :utilityId AND c.kind = :reading', {
      utilityId,
      reading: ConsumptionKind.READING,
    })
    .andWhere('c.deleted = 0 AND c.reading_date = :date', { date })
    .orderBy('c.id')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Lettura precedente dell'utenza (per data): una lettura nuova non può essere più bassa.
export async function previousReading(
  m: EntityManager,
  utilityId: number,
  date: string,
): Promise<{ reading_value: string; reading_date: unknown; meter_number: string | null } | null> {
  const row = await consumptions(m)
    .select([
      'c.reading_value AS reading_value',
      'c.reading_date AS reading_date',
      'c.meter_number AS meter_number',
    ])
    .where('c.utility_id_fk = :utilityId AND c.kind = :reading', {
      utilityId,
      reading: ConsumptionKind.READING,
    })
    .andWhere('c.deleted = 0 AND c.reading_value IS NOT NULL AND c.reading_date < :date', { date })
    .orderBy('c.reading_date', 'DESC')
    .addOrderBy('c.id', 'DESC')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Letture del contatore collegate alla fattura.
export function ownReadings(
  m: EntityManager,
  invoiceId: number,
): Promise<{ id: number; utility_id_fk: number }[]> {
  return consumptions(m)
    .select(['c.id AS id', 'c.utility_id_fk AS utility_id_fk'])
    .where('c.invoice_id_fk = :invoiceId AND c.kind = :reading AND c.deleted = 0', {
      invoiceId,
      reading: ConsumptionKind.READING,
    })
    .getRawMany();
}

// Rilevazioni collegate alle righe della fattura.
export function linkedToLines(
  m: EntityManager,
  invoiceId: number,
): Promise<{ id: number; utility_id_fk: number }[]> {
  return consumptions(m)
    .select(['c.id AS id', 'c.utility_id_fk AS utility_id_fk'])
    .distinct(true)
    .innerJoin('invoice_lines', 'l', 'c.id = l.consumption_id_fk')
    .where('l.invoice_id_fk = :invoiceId', { invoiceId })
    .getRawMany();
}
