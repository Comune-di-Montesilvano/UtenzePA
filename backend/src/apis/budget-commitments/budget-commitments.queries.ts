import { EntityManager } from 'typeorm';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { CommitmentShareSource } from '@apis/invoices/entity/commitment-share-source.enum';
import { InvoiceCommitmentShare } from '@apis/invoices/entity/invoice-commitment-share.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { BudgetCommitmentYear } from './entity/budget-commitment-year.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';

// Letture e scritture degli impegni con il QueryBuilder. Valori grezzi del driver
// (decimal come stringhe, JSON già decodificato): li normalizza il servizio.

type Row = Record<string, unknown>;

// Speso = quote di fatture non cancellate e non rifiutate; per annualità
// quelle con il suo esercizio.
const VALID_SHARES = `FROM invoice_commitment_shares s
      JOIN invoices i ON i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`;

export interface CommitmentFilter {
  id?: number;
  deleted?: boolean;
  fiscal_year?: number;
  budget_chapter_id?: number;
  supplier_id?: number;
  contract_id?: number;
  consip_agreement_id?: number;
}

// Righe dell'elenco (e della scheda con `id`): annualità con speso, contratti e
// fornitore; dalla competenza più recente, poi per numero (preimpegni in fondo).
export function commitmentRows(m: EntityManager, f: CommitmentFilter): Promise<Row[]> {
  const qb = m
    .createQueryBuilder(BudgetCommitment, 'bc')
    .innerJoin(BudgetChapter, 'ch', 'ch.id = bc.budget_chapter_id_fk')
    .leftJoin(ThirdParty, 'tp', 'tp.id = bc.supplier_id_fk')
    .select([
      'bc.id AS id',
      'bc.commitment_year AS commitment_year',
      'bc.commitment_num AS commitment_num',
      'bc.commitment_sub AS commitment_sub',
      'bc.budget_chapter_id_fk AS budget_chapter_id_fk',
      'ch.description AS chapter_description',
      'bc.supplier_id_fk AS supplier_id_fk',
      'bc.notes AS notes',
      'bc.source AS source',
      'bc.deleted AS deleted',
    ])
    .addSelect("CONCAT(ch.chapter_code, '/', ch.article)", 'chapter_label')
    .addSelect(
      (sub) =>
        sub
          .select('MIN(y.fiscal_year)')
          .from(BudgetCommitmentYear, 'y')
          .where('y.commitment_id = bc.id'),
      'fiscal_year',
    )
    .addSelect(
      `(SELECT JSON_ARRAYAGG(JSON_OBJECT('fiscal_year', y.fiscal_year, 'amount', y.amount,
         'spent', (SELECT COALESCE(SUM(s.amount), 0) ${VALID_SHARES}
                   WHERE s.commitment_id_fk = bc.id AND s.fiscal_year = y.fiscal_year)))
        FROM budget_commitment_years y WHERE y.commitment_id = bc.id)`,
      'years',
    )
    .addSelect(
      "COALESCE(tp.company_name, TRIM(CONCAT(COALESCE(tp.last_name, ''), ' ', COALESCE(tp.first_name, ''))))",
      'supplier_name',
    )
    .addSelect(
      (sub) =>
        sub
          .select('JSON_ARRAYAGG(bcc.contract_id)')
          .from('budget_commitment_contracts', 'bcc')
          .where('bcc.commitment_id = bc.id'),
      'contract_ids',
    )
    .addSelect(
      `(SELECT COALESCE(SUM(s.amount), 0) ${VALID_SHARES} WHERE s.commitment_id_fk = bc.id)`,
      'spent',
    );
  if (f.id !== undefined) qb.andWhere('bc.id = :id', { id: f.id });
  if (f.deleted !== undefined) qb.andWhere('bc.deleted = :deleted', { deleted: f.deleted ? 1 : 0 });
  if (f.fiscal_year) {
    qb.andWhere(
      'EXISTS (SELECT 1 FROM budget_commitment_years fy WHERE fy.commitment_id = bc.id AND fy.fiscal_year = :fiscalYear)',
      { fiscalYear: f.fiscal_year },
    );
  }
  if (f.budget_chapter_id)
    qb.andWhere('bc.budget_chapter_id_fk = :chapterId', { chapterId: f.budget_chapter_id });
  if (f.supplier_id) qb.andWhere('bc.supplier_id_fk = :supplierId', { supplierId: f.supplier_id });
  if (f.contract_id) {
    qb.andWhere(
      'EXISTS (SELECT 1 FROM budget_commitment_contracts x WHERE x.commitment_id = bc.id AND x.contract_id = :contractId)',
      { contractId: f.contract_id },
    );
  }
  if (f.consip_agreement_id) {
    qb.andWhere(
      'EXISTS (SELECT 1 FROM budget_commitment_contracts xa JOIN contracts c ON c.id = xa.contract_id AND c.deleted = 0 ' +
        'WHERE xa.commitment_id = bc.id AND c.consip_agreement_id = :agreementId)',
      { agreementId: f.consip_agreement_id },
    );
  }
  return qb
    .orderBy('fiscal_year', 'DESC')
    .addOrderBy('bc.commitment_num IS NULL')
    .addOrderBy('bc.commitment_year')
    .addOrderBy('bc.commitment_num')
    .addOrderBy('bc.commitment_sub')
    .addOrderBy('bc.id')
    .getRawMany();
}

// Quote delle fatture valide sull'impegno, per data.
export function commitmentInvoices(m: EntityManager, commitmentId: number): Promise<Row[]> {
  return m
    .createQueryBuilder(InvoiceCommitmentShare, 's')
    .innerJoin(
      Invoice,
      'i',
      `i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    )
    .select([
      's.id AS share_id',
      'i.id AS invoice_id',
      'i.invoice_id AS invoice_number',
      'i.invoice_date AS invoice_date',
      's.amount AS amount',
      's.fiscal_year AS fiscal_year',
      's.source AS source',
    ])
    .where('s.commitment_id_fk = :commitmentId', { commitmentId })
    .orderBy('i.invoice_date')
    .addOrderBy('i.id')
    .addOrderBy('s.id')
    .getRawMany();
}

// Fatture valide con quote a mano sull'impegno.
export async function manualInvoiceCount(m: EntityManager, commitmentId: number): Promise<number> {
  const row: { n: string } | undefined = await m
    .createQueryBuilder(InvoiceCommitmentShare, 's')
    .innerJoin(
      Invoice,
      'i',
      `i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    )
    .select('COUNT(DISTINCT s.invoice_id_fk)', 'n')
    .where('s.commitment_id_fk = :commitmentId AND s.source = :manual', {
      commitmentId,
      manual: CommitmentShareSource.MANUAL,
    })
    .getRawOne();
  return Number(row?.n ?? 0);
}

// Annualità sostituite in blocco.
export async function replaceYears(
  m: EntityManager,
  commitmentId: number,
  years: { fiscal_year: number; amount: number | null }[],
): Promise<void> {
  await m.delete(BudgetCommitmentYear, { commitment_id: commitmentId });
  await m.insert(
    BudgetCommitmentYear,
    years.map((y) => ({
      commitment_id: commitmentId,
      fiscal_year: y.fiscal_year,
      amount: y.amount,
    })),
  );
}

// Quote a mano su esercizi che l'impegno non ha più, per esercizio.
export function manualOrphans(
  m: EntityManager,
  commitmentId: number,
  years: number[],
): Promise<{ fiscal_year: number; n: string }[]> {
  return m
    .createQueryBuilder(InvoiceCommitmentShare, 's')
    .select('s.fiscal_year', 'fiscal_year')
    .addSelect('COUNT(*)', 'n')
    .where('s.commitment_id_fk = :commitmentId AND s.source = :manual', {
      commitmentId,
      manual: CommitmentShareSource.MANUAL,
    })
    .andWhere('s.fiscal_year NOT IN (:...years)', { years })
    .groupBy('s.fiscal_year')
    .getRawMany();
}

// Quote a mano di un esercizio spostate su un altro.
export async function moveManualShares(
  m: EntityManager,
  commitmentId: number,
  from: number,
  to: number,
): Promise<void> {
  await m
    .createQueryBuilder()
    .update(InvoiceCommitmentShare)
    .set({ fiscal_year: to })
    .where('commitment_id_fk = :commitmentId AND source = :manual AND fiscal_year = :from', {
      commitmentId,
      manual: CommitmentShareSource.MANUAL,
      from,
    })
    .execute();
}
