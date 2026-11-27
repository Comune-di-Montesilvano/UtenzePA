import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { BudgetChapterSpending } from '@apis/budget-chapter-spending/entity/budget-chapter-spending.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetCommitmentYear } from '@apis/budget-commitments/entity/budget-commitment-year.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { UtilityConsumption } from '@apis/utility-consumptions/entity/utility-consumption.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { inChargeSql } from '@apis/utility/cost-status';
import { Utility } from '@apis/utility/entity/utility.entity';
import { lineYearSql } from './line-year';

// Letture della spesa (capitoli, impegni, utenze, immobili) con il QueryBuilder.
// Valori grezzi del driver (decimal come stringhe): li normalizzano i chiamanti.
// Le voci di spesa per capitolo (quote o righe, UNION ALL) sono in chapter-items.sql.ts.

type Row = Record<string, unknown>;
const ymd = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;

// Annualità degli impegni (bcy) con il loro impegno (bcm), contate una volta
// qualunque sia il numero dei contratti collegati: un pluriennale conta in ogni
// suo esercizio.
export const commitmentYears = (m: EntityManager): SelectQueryBuilder<BudgetCommitmentYear> =>
  m
    .createQueryBuilder(BudgetCommitmentYear, 'bcy')
    .innerJoin(BudgetCommitment, 'bcm', 'bcm.id = bcy.commitment_id');

// Speso di un'annualità (bcm, bcy): quote di fatture valide con il suo esercizio.
export const COMMITMENT_SPENT = `(SELECT COALESCE(SUM(ss.amount), 0) FROM invoice_commitment_shares ss
  JOIN invoices si ON si.id = ss.invoice_id_fk AND si.deleted = 0 AND ${NOT_REJECTED_SQL('si')}
  WHERE ss.commitment_id_fk = bcm.id AND ss.fiscal_year = bcy.fiscal_year)`;
// Rimanenza delle annualità con importo (null se nessuna ne ha).
export const COMMITMENTS_REMAINING = `SUM(CASE WHEN bcy.amount IS NULL THEN NULL ELSE bcy.amount - ${COMMITMENT_SPENT} END)`;

// Righe di fatture valide (non cancellate né rifiutate): spesa per utenza e immobile.
const YEAR = lineYearSql({ line: 'il', invoice: 'i' });
const validLines = (m: EntityManager) =>
  m
    .createQueryBuilder(InvoiceLine, 'il')
    .innerJoin(
      Invoice,
      'i',
      `i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    );

// --- Esercizi del capitolo ---

const BUDGET_COLUMNS = [
  's.id AS id',
  's.initial_budget AS initial_budget',
  's.adjusted_budget AS adjusted_budget',
  's.amount AS amount',
  's.notes AS notes',
  's.source AS source',
];

export function chapterBudgets(m: EntityManager, chapterId: number): Promise<Row[]> {
  return m
    .createQueryBuilder(BudgetChapterSpending, 's')
    .select(['s.year AS year', ...BUDGET_COLUMNS])
    .where('s.budget_chapter_id_fk = :chapterId AND s.deleted = 0', { chapterId })
    .getRawMany();
}

export function yearBudgets(m: EntityManager, year: number): Promise<Row[]> {
  return m
    .createQueryBuilder(BudgetChapterSpending, 's')
    .select(['s.budget_chapter_id_fk AS chapter_id', ...BUDGET_COLUMNS])
    .where('s.year = :year AND s.deleted = 0', { year })
    .getRawMany();
}

const withCommitted = <T extends SelectQueryBuilder<BudgetCommitmentYear>>(qb: T): T =>
  qb
    .addSelect('COUNT(*)', 'commitments')
    .addSelect('SUM(bcy.amount)', 'total')
    .addSelect('SUM(bcy.amount IS NULL)', 'without_amount')
    .addSelect(COMMITMENTS_REMAINING, 'remaining');

// Impegnato del capitolo per esercizio.
export function chapterCommitted(m: EntityManager, chapterId: number): Promise<Row[]> {
  return withCommitted(commitmentYears(m).select('bcy.fiscal_year', 'year'))
    .where('bcm.budget_chapter_id_fk = :chapterId AND bcm.deleted = 0', { chapterId })
    .groupBy('bcy.fiscal_year')
    .getRawMany();
}

// Impegnato dell'esercizio per capitolo.
export function yearCommitted(m: EntityManager, year: number): Promise<Row[]> {
  return withCommitted(commitmentYears(m).select('bcm.budget_chapter_id_fk', 'chapter_id'))
    .where('bcy.fiscal_year = :year AND bcm.deleted = 0', { year })
    .groupBy('bcm.budget_chapter_id_fk')
    .getRawMany();
}

// Impegni del capitolo: una riga per impegno con le sue annualità.
export function chapterCommitments(m: EntityManager, chapterId: number): Promise<Row[]> {
  return commitmentYears(m)
    .leftJoin(ThirdParty, 'tp', 'tp.id = bcm.supplier_id_fk')
    .select([
      'bcm.id AS id',
      'bcm.commitment_year AS commitment_year',
      'bcm.commitment_num AS commitment_num',
      'bcm.commitment_sub AS commitment_sub',
    ])
    .addSelect('MIN(bcy.fiscal_year)', 'fiscal_year')
    .addSelect('JSON_ARRAYAGG(bcy.fiscal_year)', 'fiscal_years')
    .addSelect('IF(SUM(bcy.amount IS NULL) > 0, NULL, SUM(bcy.amount))', 'amount')
    .addSelect(`SUM(${COMMITMENT_SPENT})`, 'spent')
    .addSelect(`MAX(${partyNameSql('tp')})`, 'supplier')
    .addSelect(
      (sub) =>
        sub
          .select('JSON_ARRAYAGG(x.contract_id)')
          .from('budget_commitment_contracts', 'x')
          .where('x.commitment_id = bcm.id'),
      'contract_ids',
    )
    .where('bcm.budget_chapter_id_fk = :chapterId AND bcm.deleted = 0', { chapterId })
    .groupBy('bcm.id')
    .orderBy('fiscal_year', 'DESC')
    .addOrderBy('bcm.commitment_num IS NULL')
    .addOrderBy('bcm.commitment_year')
    .addOrderBy('bcm.commitment_num')
    .addOrderBy('bcm.commitment_sub')
    .getRawMany();
}

// --- Statistiche delle utenze del capitolo ---

// Utenze del capitolo (non cancellate) più quelle indicate (di altri capitoli,
// pagate sul capitolo), con il capitolo assegnato.
export function statsUtilities(
  m: EntityManager,
  chapterId: number,
  extraIds: number[],
): Promise<Row[]> {
  const qb = m
    .createQueryBuilder(Utility, 'u')
    .leftJoin(UtilityType, 't', 't.id = u.utility_type_id_fk')
    .leftJoin(BudgetChapter, 'b', 'b.id = u.budget_chapter_code_fk')
    .select([
      'u.id AS id',
      'u.utility_id AS utility_code',
      't.name AS type_name',
      't.hard_type AS hard_type',
      'u.supply_active AS supply_active',
      'u.budget_chapter_code_fk AS chapter_id',
    ])
    .addSelect("CONCAT(b.chapter_code, '/', b.article)", 'chapter_label')
    .where('u.budget_chapter_code_fk = :chapterId AND u.deleted = 0', { chapterId });
  if (extraIds.length) qb.orWhere('u.id IN (:...extraIds)', { extraIds });
  return qb.getRawMany();
}

// Quota di ogni fattura pagata sul capitolo (:chapterId): quote d'impegno del
// capitolo sul totale delle quote (a pari zero, per numero); senza quote conta
// il capitolo dell'utenza della riga (regola di CHAPTER_ITEMS); stornate e note
// compensate non pesano su nessun capitolo.
const HERE = `CASE WHEN NOT ${NOT_OFFSET_SQL('i')} THEN 0
  WHEN sh.invoice_id IS NULL THEN IF(lu.budget_chapter_code_fk = :chapterId, 1, 0)
  WHEN sh.total <> 0 THEN sh.here / sh.total
  ELSE sh.n_here / sh.n END`;

const linesWithHere = (m: EntityManager, chapterId: number, start: string, end: string) =>
  validLines(m)
    .leftJoin(Utility, 'lu', 'lu.id = il.utility_id_fk')
    .leftJoin(
      (sub) =>
        sub
          .select('s.invoice_id_fk', 'invoice_id')
          .addSelect('SUM(s.amount)', 'total')
          .addSelect(
            'SUM(CASE WHEN bcm.budget_chapter_id_fk = :chapterId THEN s.amount ELSE 0 END)',
            'here',
          )
          .addSelect('COUNT(*)', 'n')
          .addSelect('SUM(bcm.budget_chapter_id_fk = :chapterId)', 'n_here')
          .from('invoice_commitment_shares', 's')
          .innerJoin(BudgetCommitment, 'bcm', 'bcm.id = s.commitment_id_fk')
          .groupBy('s.invoice_id_fk'),
      'sh',
      'sh.invoice_id = il.invoice_id_fk',
    )
    .select('il.utility_id_fk', 'utility_id')
    .addSelect('il.amount', 'amount')
    .addSelect(ymd('il.period_start'), 'period_start')
    .addSelect(ymd('il.period_end'), 'period_end')
    .addSelect(ymd('i.invoice_date'), 'invoice_date')
    .addSelect(HERE, 'here')
    .where('COALESCE(il.period_end, il.period_start, i.invoice_date) >= :start', { start })
    .andWhere('COALESCE(il.period_start, il.period_end, i.invoice_date) <= :end', { end })
    .setParameter('chapterId', chapterId);

// Righe dell'utenza nel periodo con la quota (0..1) pagata su ogni capitolo
// delle quote d'impegno della fattura (fatture senza quote escluse).
export function utilityLinesByChapter(
  m: EntityManager,
  utilityId: number,
  start: string,
  end: string,
): Promise<Row[]> {
  return validLines(m)
    .innerJoin(
      (sub) =>
        sub
          .select('s.invoice_id_fk', 'invoice_id')
          .addSelect('SUM(s.amount)', 'total')
          .from('invoice_commitment_shares', 's')
          .groupBy('s.invoice_id_fk'),
      'tot',
      'tot.invoice_id = il.invoice_id_fk AND tot.total <> 0',
    )
    .innerJoin(
      (sub) =>
        sub
          .select('s.invoice_id_fk', 'invoice_id')
          .addSelect('bcm.budget_chapter_id_fk', 'chapter_id')
          .addSelect('SUM(s.amount)', 'amount')
          .from('invoice_commitment_shares', 's')
          .innerJoin(BudgetCommitment, 'bcm', 'bcm.id = s.commitment_id_fk')
          .groupBy('s.invoice_id_fk')
          .addGroupBy('bcm.budget_chapter_id_fk'),
      'shc',
      'shc.invoice_id = il.invoice_id_fk',
    )
    .innerJoin(BudgetChapter, 'b', 'b.id = shc.chapter_id')
    .select('il.amount', 'amount')
    .addSelect(ymd('il.period_start'), 'period_start')
    .addSelect(ymd('il.period_end'), 'period_end')
    .addSelect(ymd('i.invoice_date'), 'invoice_date')
    .addSelect('shc.chapter_id', 'chapter_id')
    .addSelect("CONCAT(b.chapter_code, '/', b.article)", 'chapter_label')
    .addSelect('shc.amount / tot.total', 'share')
    .where('il.utility_id_fk = :utilityId', { utilityId })
    .andWhere(`${NOT_OFFSET_SQL('i')}`)
    .andWhere('COALESCE(il.period_end, il.period_start, i.invoice_date) >= :start', { start })
    .andWhere('COALESCE(il.period_start, il.period_end, i.invoice_date) <= :end', { end })
    .getRawMany();
}

// Righe delle utenze che toccano il periodo [start, end] (giorni 'AAAA-MM-GG'),
// con la quota pagata sul capitolo (here).
export function utilityLines(
  m: EntityManager,
  chapterId: number,
  utilityIds: number[],
  start: string,
  end: string,
): Promise<Row[]> {
  return linesWithHere(m, chapterId, start, end)
    .andWhere('il.utility_id_fk IN (:...utilityIds)', { utilityIds })
    .getRawMany();
}

// Righe pagate in parte sul capitolo nel periodo: le utenze di altri capitoli
// (utility_id) e le righe senza utenza (canoni, servizi del contratto).
export function paidHereLines(
  m: EntityManager,
  chapterId: number,
  start: string,
  end: string,
): Promise<Row[]> {
  return linesWithHere(m, chapterId, start, end)
    .andWhere('sh.here IS NOT NULL AND sh.n_here > 0')
    .andWhere(`${NOT_OFFSET_SQL('i')}`)
    .getRawMany();
}

// Tutte le rilevazioni: le coppie di letture servono anche prima del periodo.
export function utilityConsumptions(m: EntityManager, utilityIds: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder(UtilityConsumption, 'c')
    .select([
      'c.id AS id',
      'c.utility_id_fk AS utility_id',
      'c.kind AS kind',
      'c.reading_value AS reading_value',
      'c.meter_number AS meter_number',
      'c.consumption AS consumption',
      'c.is_estimated AS is_estimated',
    ])
    .addSelect(ymd('c.reading_date'), 'reading_date')
    .addSelect(ymd('c.period_start'), 'period_start')
    .addSelect(ymd('c.period_end'), 'period_end')
    .where('c.utility_id_fk IN (:...utilityIds) AND c.deleted = 0', { utilityIds })
    .getRawMany();
}

// Esercizi (competenza delle righe) con fatture delle utenze.
export function utilityLineYears(m: EntityManager, utilityIds: number[]): Promise<Row[]> {
  return validLines(m)
    .select(YEAR, 'year')
    .distinct(true)
    .where('il.utility_id_fk IN (:...utilityIds)', { utilityIds })
    .getRawMany();
}

// --- Controllo del bilancio dalla scheda fattura ---

// Capitolo ed esercizi degli impegni non cancellati.
export function commitmentChapters(m: EntityManager, commitmentIds: number[]): Promise<Row[]> {
  return commitmentYears(m)
    .select('bcm.id', 'id')
    .addSelect('bcm.budget_chapter_id_fk', 'chapter_id')
    .addSelect('JSON_ARRAYAGG(bcy.fiscal_year)', 'years')
    .where('bcm.id IN (:...commitmentIds) AND bcm.deleted = 0', { commitmentIds })
    .groupBy('bcm.id')
    .getRawMany();
}

export function utilityChapters(m: EntityManager, utilityIds: number[]): Promise<Row[]> {
  return m
    .createQueryBuilder(Utility, 'u')
    .select(['u.id AS id', 'u.budget_chapter_code_fk AS chapter_id'])
    .where('u.id IN (:...utilityIds)', { utilityIds })
    .getRawMany();
}

// Capitolo non cancellato con l'assestato dell'esercizio (null se manca).
export function chapterBudget(
  m: EntityManager,
  chapterId: number,
  year: number,
): Promise<Row | undefined> {
  return m
    .createQueryBuilder(BudgetChapter, 'b')
    .leftJoin(
      BudgetChapterSpending,
      's',
      's.budget_chapter_id_fk = b.id AND s.year = :year AND s.deleted = 0',
      { year },
    )
    .select(['b.chapter_code AS chapter_code', 'b.article AS article'])
    .addSelect('s.adjusted_budget', 'adjusted_budget')
    .where('b.id = :chapterId AND b.deleted = 0', { chapterId })
    .getRawOne();
}

// --- Spesa per utenza e immobile ---

const yearTotals = (qb: SelectQueryBuilder<InvoiceLine>) =>
  qb
    .select(YEAR, 'year')
    .addSelect('SUM(il.amount)', 'total')
    .addSelect('COUNT(DISTINCT i.id)', 'invoices')
    .groupBy('year')
    .orderBy('year', 'DESC');

export function utilityYears(m: EntityManager, utilityId: number): Promise<Row[]> {
  return yearTotals(validLines(m))
    .where('il.utility_id_fk = :utilityId', { utilityId })
    .getRawMany();
}

export function assetYears(m: EntityManager, assetId: number): Promise<Row[]> {
  return yearTotals(
    validLines(m).innerJoin(
      'utility_assets',
      'ua',
      'ua.utility_id = il.utility_id_fk AND ua.asset_id = :assetId',
      { assetId },
    ),
  ).getRawMany();
}

// Utenze dell'immobile collegate anche ad altri immobili.
export async function sharedUtilities(m: EntityManager, assetId: number): Promise<number> {
  const qb = m.createQueryBuilder().from('utility_assets', 'ua');
  const other = qb
    .subQuery()
    .select('1')
    .from('utility_assets', 'o')
    .where('o.utility_id = ua.utility_id AND o.asset_id <> ua.asset_id')
    .getQuery();
  const row: { shared: string } | undefined = await qb
    .select('COUNT(*)', 'shared')
    .where('ua.asset_id = :assetId', { assetId })
    .andWhere(`EXISTS ${other}`)
    .getRawOne();
  return Number(row?.shared ?? 0);
}

// --- Capitoli del contratto ---

// Utenze in carico al Comune (attive e non volturate) del contratto, per capitolo.
export function contractUtilityChapters(m: EntityManager, contractId: number): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .from('contract_utilities', 'cu')
    .innerJoin(Utility, 'u', `u.id = cu.utility_id AND u.deleted = 0 AND ${inChargeSql('u')}`)
    .leftJoin(BudgetChapter, 'b', 'b.id = u.budget_chapter_code_fk')
    .select([
      'b.id AS budget_chapter_id',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
    ])
    .addSelect('COUNT(*)', 'utilities')
    .where('cu.contract_id = :contractId', { contractId })
    .groupBy('b.id')
    .addGroupBy('b.chapter_code')
    .addGroupBy('b.article')
    .addGroupBy('b.description')
    .orderBy('b.chapter_code')
    .addOrderBy('b.article')
    .getRawMany();
}

// Annualità degli impegni collegati al contratto, con il capitolo.
export function contractCommitments(m: EntityManager, contractId: number): Promise<Row[]> {
  return commitmentYears(m)
    .innerJoin(BudgetChapter, 'b', 'b.id = bcm.budget_chapter_id_fk')
    .innerJoin(
      'budget_commitment_contracts',
      'bcc',
      'bcc.commitment_id = bcm.id AND bcc.contract_id = :contractId',
      { contractId },
    )
    .select([
      'bcm.id AS id',
      'bcm.budget_chapter_id_fk AS budget_chapter_id',
      'bcy.fiscal_year AS fiscal_year',
      'bcy.amount AS amount',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
    ])
    .where('bcm.deleted = 0')
    .orderBy('bcy.fiscal_year', 'DESC')
    .getRawMany();
}
