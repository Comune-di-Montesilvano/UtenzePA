import { EntityManager } from 'typeorm';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';

// Letture del fabbisogno della convenzione. «Ordine» = contratto di fornitura non
// cancellato della convenzione, bozze e chiusi compresi: l'orizzonte comprende anche
// gli ordini conclusi. Il collegamento passa sempre dal contratto, mai dal codice di
// gara. Date come 'AAAA-MM-GG' (giorno, non istante), come le vuole il calcolo.

type Row = Record<string, unknown>;

const day = (col: string): string => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

export function agreementExists(m: EntityManager, id: number): Promise<boolean> {
  return m.getRepository(ConsipAgreement).exists({ where: { id, deleted: false } });
}

export function orders(m: EntityManager, agreementId: number): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('c.id', 'id')
    .addSelect('c.draft', 'draft')
    .addSelect('c.closed', 'closed')
    .addSelect(day('c.supply_start_date'), 'supply_start')
    .addSelect(day('c.supply_expiry_date'), 'supply_end')
    .from('contracts', 'c')
    .where('c.deleted = 0 AND c.consip_agreement_id = :agreementId', { agreementId })
    .getRawMany();
}

export function orderUtilities(m: EntityManager, agreementId: number): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('cu.contract_id', 'contract_id')
    .addSelect('cu.utility_id', 'utility_id')
    .from('contract_utilities', 'cu')
    .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
    .where('c.consip_agreement_id = :agreementId', { agreementId })
    .getRawMany();
}

export function utilities(m: EntityManager, ids: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('u.id', 'id')
    .addSelect('u.utility_id', 'utility_code')
    .addSelect('t.hard_type', 'hard_type')
    .addSelect('u.budget_chapter_code_fk', 'chapter_id')
    .addSelect('u.estimated_annual_consumption', 'estimated_annual_consumption')
    .from('utilities', 'u')
    .leftJoin('utility_types', 't', 't.id = u.utility_type_id_fk')
    .where('u.id IN (:...ids) AND u.deleted = 0', { ids })
    .getRawMany();
}

// Righe di qualunque fattura valida dell'utenza, fino alla data.
export function lines(m: EntityManager, ids: number[], cutoff: string): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('il.utility_id_fk', 'utility_id')
    .addSelect('il.amount', 'amount')
    .addSelect(day('il.period_start'), 'period_start')
    .addSelect(day('il.period_end'), 'period_end')
    .addSelect(day('i.invoice_date'), 'invoice_date')
    .from('invoice_lines', 'il')
    .innerJoin(
      'invoices',
      'i',
      `i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} AND ${NOT_OFFSET_SQL('i')}`,
    )
    .where('il.utility_id_fk IN (:...ids) AND i.invoice_date <= :cutoff', { ids, cutoff })
    .getRawMany();
}

// Tutte le rilevazioni fino alla data: le coppie di letture servono anche prima
// dell'orizzonte.
export function consumptions(m: EntityManager, ids: number[], cutoff: string): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('uc.id', 'id')
    .addSelect('uc.utility_id_fk', 'utility_id')
    .addSelect('uc.kind', 'kind')
    .addSelect(day('uc.reading_date'), 'reading_date')
    .addSelect('uc.reading_value', 'reading_value')
    .addSelect('uc.meter_number', 'meter_number')
    .addSelect(day('uc.period_start'), 'period_start')
    .addSelect(day('uc.period_end'), 'period_end')
    .addSelect('uc.consumption', 'consumption')
    .addSelect('uc.is_estimated', 'is_estimated')
    .from('utility_consumptions', 'uc')
    .where('uc.utility_id_fk IN (:...ids) AND uc.deleted = 0', { ids })
    .andWhere('COALESCE(uc.period_end, uc.reading_date) <= :cutoff', { cutoff })
    .getRawMany();
}

export function events(m: EntityManager, ids: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('e.id', 'id')
    .addSelect('e.utility_id_fk', 'utility_id')
    .addSelect('e.type', 'type')
    .addSelect('e.third_party_id_fk', 'third_party_id_fk')
    .addSelect(day('e.requested_on'), 'requested_on')
    .addSelect(day('e.effective_on'), 'effective_on')
    .addSelect('e.date_unknown', 'date_unknown')
    .addSelect(day('e.cancelled_on'), 'cancelled_on')
    .addSelect('e.utilizer_grant_id_fk', 'utilizer_grant_id_fk')
    .addSelect('e.deleted', 'deleted')
    .addSelect('e.create_date', 'create_date')
    .from('utility_supply_events', 'e')
    .where('e.utility_id_fk IN (:...ids) AND e.deleted = 0', { ids })
    .getRawMany();
}

export function chapters(m: EntityManager, ids: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('b.id', 'id')
    .addSelect('b.chapter_code', 'chapter_code')
    .addSelect('b.article', 'article')
    .addSelect('b.description', 'description')
    .from('budget_chapters', 'b')
    .where('b.id IN (:...ids)', { ids })
    .getRawMany();
}

// Convenzioni da tenere aggiornate: almeno un ordine non chiuso.
export async function openAgreementIds(m: EntityManager): Promise<number[]> {
  const rows: { id: number }[] = await m
    .createQueryBuilder()
    .select('a.id', 'id')
    .from('consip_agreement', 'a')
    .where('a.deleted = 0')
    .andWhere(
      'EXISTS (SELECT 1 FROM contracts c WHERE c.consip_agreement_id = a.id AND c.deleted = 0 AND c.closed = 0)',
    )
    .getRawMany();
  return rows.map((r) => Number(r.id));
}

export async function agreementIdsOfContracts(
  m: EntityManager,
  contractIds: number[],
): Promise<number[]> {
  const rows: { id: number }[] = await m
    .createQueryBuilder()
    .select('DISTINCT c.consip_agreement_id', 'id')
    .from('contracts', 'c')
    .where('c.id IN (:...contractIds) AND c.consip_agreement_id IS NOT NULL', { contractIds })
    .getRawMany();
  return rows.map((r) => Number(r.id));
}
