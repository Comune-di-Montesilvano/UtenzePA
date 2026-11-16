import { EntityManager } from 'typeorm';
import { CommitmentShareSource } from '@apis/invoices/entity/commitment-share-source.enum';
import { InvoiceCommitmentShare } from '@apis/invoices/entity/invoice-commitment-share.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { BudgetCommitmentYear } from './entity/budget-commitment-year.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';

// Letture e scritture della riconciliazione delle quote automatiche con il
// QueryBuilder (l'inserimento condizionato della quota è in commitment-reconcile.sql.ts).
// Valori grezzi del driver: JSON già decodificato, decimal come stringhe.

type Row = Record<string, unknown>;
const { AUTO } = CommitmentShareSource;

const contractIds = (rows: { contract_id: unknown }[]): number[] =>
  rows.map((r) => Number(r.contract_id));

// Contratti che condividono un impegno (non cancellato) con quelli dati.
export async function sharingContracts(m: EntityManager, ids: number[]): Promise<number[]> {
  return contractIds(
    await m
      .createQueryBuilder()
      .select('DISTINCT b2.contract_id', 'contract_id')
      .from('budget_commitment_contracts', 'b1')
      .innerJoin(BudgetCommitment, 'bc', 'bc.id = b1.commitment_id AND bc.deleted = 0')
      .innerJoin('budget_commitment_contracts', 'b2', 'b2.commitment_id = b1.commitment_id')
      .where('b1.contract_id IN (:...ids)', { ids })
      .getRawMany(),
  );
}

// Annualità degli impegni non cancellati collegati ai contratti: un pluriennale
// compare una volta per esercizio.
export function contractCommitmentYears(m: EntityManager, ids: number[]): Promise<Row[]> {
  const qb = m
    .createQueryBuilder(BudgetCommitment, 'bc')
    .innerJoin(BudgetCommitmentYear, 'bcy', 'bcy.commitment_id = bc.id');
  const linked = qb
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'x')
    .where('x.commitment_id = bc.id AND x.contract_id IN (:...ids)')
    .getQuery();
  return qb
    .select([
      'bc.id AS id',
      'bc.commitment_year AS year',
      'bc.commitment_num AS num',
      'bc.commitment_sub AS sub',
      'bcy.amount AS amount',
      'bc.budget_chapter_id_fk AS chapter',
      'bcy.fiscal_year AS fiscal_year',
    ])
    .addSelect(
      (sub) =>
        sub
          .select('JSON_ARRAYAGG(bcc.contract_id)')
          .from('budget_commitment_contracts', 'bcc')
          .where('bcc.commitment_id = bc.id'),
      'contract_ids',
    )
    .where('bc.deleted = 0')
    .andWhere(`EXISTS ${linked}`, { ids })
    .getRawMany();
}

// Una riga per fattura valida dei contratti, o con quote fisse sugli impegni
// (anche di contratti scollegati: consumano la stessa rimanenza mostrata nella
// scheda). Importo = totale in testata, altrimenti somma delle righe; capitoli
// (JSON) delle utenze delle righe, 0 = utenza senza capitolo; quote fisse e
// quota automatica attuale (JSON).
export function reconcileInvoices(
  m: EntityManager,
  contracts: number[],
  commitmentIds: number[],
): Promise<Row[]> {
  const qb = m.createQueryBuilder(Invoice, 'i');
  const lines = (select: string) =>
    qb
      .subQuery()
      .select(select)
      .from(InvoiceLine, 'il')
      .where('il.invoice_id_fk = i.id')
      .getQuery();
  const fixedOn = qb
    .subQuery()
    .select('1')
    .from(InvoiceCommitmentShare, 'fs')
    .where('fs.invoice_id_fk = i.id AND fs.source <> :auto')
    .andWhere('fs.commitment_id_fk IN (:...commitmentIds)')
    .getQuery();
  return qb
    .select([
      'i.id AS id',
      'i.invoice_date AS date',
      'i.contratto_id_fk AS contract_id',
      'i.payment_status AS payment_status',
    ])
    .addSelect(`COALESCE(i.total_amount, ${lines('SUM(il.amount)')})`, 'amount')
    .addSelect(lines('MIN(il.period_start)'), 'period_start')
    .addSelect(lines('MAX(il.period_end)'), 'period_end')
    .addSelect(
      (sub) =>
        sub
          .select('JSON_ARRAYAGG(COALESCE(u.budget_chapter_code_fk, 0))')
          .from(InvoiceLine, 'cl')
          .innerJoin('utilities', 'u', 'u.id = cl.utility_id_fk')
          .where('cl.invoice_id_fk = i.id'),
      'chapters',
    )
    .addSelect(
      (sub) =>
        sub
          .select(
            "JSON_ARRAYAGG(JSON_OBJECT('commitment_id', f.commitment_id_fk, 'fiscal_year', f.fiscal_year, 'amount', f.amount))",
          )
          .from(InvoiceCommitmentShare, 'f')
          .where('f.invoice_id_fk = i.id AND f.source <> :auto'),
      'fixed',
    )
    .addSelect(
      (sub) =>
        sub
          .select(
            "JSON_OBJECT('commitment_id', a.commitment_id_fk, 'fiscal_year', a.fiscal_year, 'amount', a.amount)",
          )
          .from(InvoiceCommitmentShare, 'a')
          .where('a.invoice_id_fk = i.id AND a.source = :auto')
          .limit(1),
      'auto_share',
    )
    .where(`i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`)
    .andWhere(`(i.contratto_id_fk IN (:...contracts) OR EXISTS ${fixedOn})`)
    .setParameters({ auto: AUTO, contracts, commitmentIds })
    .getRawMany();
}

// Quota automatica della fattura tolta.
export async function dropAutoShare(m: EntityManager, invoiceId: number): Promise<void> {
  await m.delete(InvoiceCommitmentShare, { invoice_id_fk: invoiceId, source: AUTO });
}

// Quote automatiche di fatture senza contratto: nessun impegno possibile.
export async function dropOrphanAutoShares(m: EntityManager): Promise<void> {
  const orphans = m
    .createQueryBuilder()
    .subQuery()
    .select('i.id')
    .from(Invoice, 'i')
    .where('i.contratto_id_fk IS NULL')
    .getQuery();
  await m
    .createQueryBuilder()
    .delete()
    .from(InvoiceCommitmentShare)
    .where(`source = :auto AND invoice_id_fk IN ${orphans}`, { auto: AUTO })
    .execute();
}

// Contratti con fatture o impegni: tutti quelli da riconciliare.
export async function allContracts(m: EntityManager): Promise<number[]> {
  const withInvoices = await m
    .createQueryBuilder(Invoice, 'i')
    .select('DISTINCT i.contratto_id_fk', 'contract_id')
    .where('i.contratto_id_fk IS NOT NULL')
    .getRawMany();
  const withCommitments = await m
    .createQueryBuilder()
    .select('DISTINCT bcc.contract_id', 'contract_id')
    .from('budget_commitment_contracts', 'bcc')
    .getRawMany();
  return [...new Set([...contractIds(withInvoices), ...contractIds(withCommitments)])];
}

// Contratti in testata alle fatture con righe di queste utenze (cambio di capitolo).
export async function utilityContracts(m: EntityManager, utilityIds: number[]): Promise<number[]> {
  return contractIds(
    await m
      .createQueryBuilder(InvoiceLine, 'il')
      .innerJoin(Invoice, 'i', 'i.id = il.invoice_id_fk')
      .select('DISTINCT i.contratto_id_fk', 'contract_id')
      .where('il.utility_id_fk IN (:...utilityIds) AND i.contratto_id_fk IS NOT NULL', {
        utilityIds,
      })
      .getRawMany(),
  );
}
