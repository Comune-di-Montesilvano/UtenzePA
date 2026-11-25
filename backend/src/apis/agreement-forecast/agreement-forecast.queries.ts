import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { InvoiceCommitmentShare } from '@apis/invoices/entity/invoice-commitment-share.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { COMMITMENT_SPENT, commitmentYears } from '@apis/spending/spending.queries';

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

// --- Impegni della convenzione ---
// Impegnato, rimanenza e quote riusano i frammenti della spesa per capitolo
// (spending.queries.ts): fabbisogno e scheda del capitolo contano allo stesso modo.

// Impegno (bcm) collegato ad almeno un ordine della convenzione :agreementId.
const ofAgreement = <T extends object>(qb: SelectQueryBuilder<T>): string =>
  'EXISTS ' +
  qb
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'bcc')
    .innerJoin('contracts', 'c', 'c.id = bcc.contract_id AND c.deleted = 0')
    .where('bcc.commitment_id = bcm.id AND c.consip_agreement_id = :agreementId')
    .getQuery();

// Annualità degli impegni della convenzione per capitolo ed esercizio: ogni
// impegno conta una volta. Rimanenza = importo − tutte le quote già spese,
// qualunque fattura le abbia consumate.
export function committed(m: EntityManager, agreementId: number): Promise<Row[]> {
  const qb = commitmentYears(m);
  return qb
    .select('bcm.budget_chapter_id_fk', 'chapter_id')
    .addSelect('bcy.fiscal_year', 'year')
    .addSelect('COALESCE(SUM(bcy.amount), 0)', 'committed')
    .addSelect(
      `COALESCE(SUM(CASE WHEN bcy.amount IS NULL THEN 0 ELSE bcy.amount - ${COMMITMENT_SPENT} END), 0)`,
      'remaining',
    )
    .addSelect('SUM(bcy.amount IS NULL)', 'without_amount')
    .where('bcm.deleted = 0')
    .andWhere(ofAgreement(qb), { agreementId })
    .groupBy('bcm.budget_chapter_id_fk')
    .addGroupBy('bcy.fiscal_year')
    .getRawMany();
}

// Impegni della convenzione collegati anche a ordini di un'altra: contano per
// intero in entrambe.
export function sharedCommitments(m: EntityManager, agreementId: number): Promise<Row[]> {
  const qb = m.createQueryBuilder(BudgetCommitment, 'bcm');
  const other = qb
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'bx')
    .innerJoin('contracts', 'cx', 'cx.id = bx.contract_id AND cx.deleted = 0')
    .where('bx.commitment_id = bcm.id AND cx.consip_agreement_id IS NOT NULL')
    .andWhere('cx.consip_agreement_id <> :agreementId')
    .getQuery();
  return qb
    .select([
      'bcm.id AS id',
      'bcm.commitment_year AS commitment_year',
      'bcm.commitment_num AS commitment_num',
      'bcm.commitment_sub AS commitment_sub',
    ])
    .where('bcm.deleted = 0')
    .andWhere(ofAgreement(qb), { agreementId })
    .andWhere(`EXISTS ${other}`)
    .getRawMany();
}

// Quote sugli impegni della convenzione di fatture senza righe per utenza
// (canoni): riducono la rimanenza ma i loro giorni restano «da fatturare».
export function sharesWithoutLines(m: EntityManager, agreementId: number): Promise<Row[]> {
  const qb = m
    .createQueryBuilder(InvoiceCommitmentShare, 's')
    .innerJoin(
      Invoice,
      'i',
      `i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    )
    .innerJoin(BudgetCommitment, 'bcm', 'bcm.id = s.commitment_id_fk AND bcm.deleted = 0');
  const lines = qb
    .subQuery()
    .select('1')
    .from('invoice_lines', 'il')
    .where('il.invoice_id_fk = i.id AND il.utility_id_fk IS NOT NULL')
    .getQuery();
  return qb
    .select('s.fiscal_year', 'year')
    .addSelect('SUM(s.amount)', 'amount')
    .where(ofAgreement(qb), { agreementId })
    .andWhere(`NOT EXISTS ${lines}`)
    .groupBy('s.fiscal_year')
    .getRawMany();
}

// --- Bilancio dei capitoli ---
// Stanziamento dei capitoli per esercizio (assestato, altrimenti iniziale):
// la base della richiesta alla ragioneria.

export function chapterBudgets(
  m: EntityManager,
  chapterIds: number[],
  years: number[],
): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('s.budget_chapter_id_fk', 'chapter_id')
    .addSelect('s.year', 'year')
    .addSelect('COALESCE(s.adjusted_budget, s.initial_budget)', 'budget')
    .from('budget_chapter_spending', 's')
    .where(
      's.deleted = 0 AND s.budget_chapter_id_fk IN (:...chapterIds) AND s.year IN (:...years)',
      {
        chapterIds,
        years,
      },
    )
    .getRawMany();
}

// Utenze attive su quei capitoli fuori dalla convenzione: il capitolo paga
// anche loro, e lo stanziamento va letto tenendone conto.
export function chapterOtherUtilities(
  m: EntityManager,
  chapterIds: number[],
  ids: number[],
): Promise<Row[]> {
  const qb = m
    .createQueryBuilder()
    .select('u.budget_chapter_code_fk', 'chapter_id')
    .addSelect('COUNT(*)', 'count')
    .from('utilities', 'u')
    .where(
      'u.deleted = 0 AND u.supply_active = 1 AND u.budget_chapter_code_fk IN (:...chapterIds)',
      {
        chapterIds,
      },
    );
  if (ids.length) qb.andWhere('u.id NOT IN (:...ids)', { ids });
  return qb.groupBy('u.budget_chapter_code_fk').getRawMany();
}

// Altre convenzioni con un ordine non chiuso che arriva almeno a `today` su
// utenze dei capitoli: il loro fabbisogno pesa sullo stesso stanziamento.
export async function agreementsOnChapters(
  m: EntityManager,
  chapterIds: number[],
  agreementId: number,
  today: string,
): Promise<number[]> {
  const rows: { id: number }[] = await m
    .createQueryBuilder()
    .select('DISTINCT c.consip_agreement_id', 'id')
    .from('contracts', 'c')
    .innerJoin('contract_utilities', 'cu', 'cu.contract_id = c.id')
    .innerJoin('utilities', 'u', 'u.id = cu.utility_id AND u.deleted = 0')
    .innerJoin('consip_agreement', 'a', 'a.id = c.consip_agreement_id AND a.deleted = 0')
    .where('c.deleted = 0 AND c.closed = 0 AND c.consip_agreement_id <> :agreementId', {
      agreementId,
    })
    .andWhere('c.supply_start_date IS NOT NULL AND DATE(c.supply_expiry_date) >= :today', { today })
    .andWhere('u.budget_chapter_code_fk IN (:...chapterIds)', { chapterIds })
    .getRawMany();
  return rows.map((r) => Number(r.id)).sort((a, b) => a - b);
}

export function agreementNames(m: EntityManager, ids: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select('a.id', 'id')
    .addSelect('a.name', 'name')
    .from('consip_agreement', 'a')
    .where('a.id IN (:...ids)', { ids })
    .getRawMany();
}
