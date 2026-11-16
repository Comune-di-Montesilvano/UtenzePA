import { EntityManager, EntityTarget, In, ObjectLiteral } from 'typeorm';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from '@apis/budget-chapter-spending/entity/budget-chapter-spending.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { BudgetCommitmentYear } from '@apis/budget-commitments/entity/budget-commitment-year.entity';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';
import { SdiMessage } from '@apis/invoice-import/entity/sdi-message.entity';
import { InvoiceCommitmentShare } from '@apis/invoices/entity/invoice-commitment-share.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { Utility } from '@apis/utility/entity/utility.entity';
import type { CurrentSpending } from './chapter-plan';
import type { CurrentCommitment } from './commitment-plan';
import type { CurrentShare } from './share-plan';
import { AccChapter } from './entity/acc-chapter.entity';
import { AccCommitment } from './entity/acc-commitment.entity';
import { AccCreditNote } from './entity/acc-credit-note.entity';
import { AccLiquidation } from './entity/acc-liquidation.entity';
import { RecordSource } from './record-source.enum';

// Letture e scritture dell'import della contabilità. Valori grezzi del driver (i
// decimal come stringhe, le date come 'AAAA-MM-GG'): li normalizzano i servizi.

type Row = Record<string, unknown>;
const ymd = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;
// Chiave del soggetto terzo nei file della contabilità: P.IVA, altrimenti codice fiscale.
const PARTY_VAT = "COALESCE(NULLIF(t.vat_number, ''), t.tax_code)";
const COMMITMENT_KEY = ['commitment_year', 'commitment_num', 'commitment_sub'];

// --- Tabelle di appoggio acc_* ---

export function accChapters(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(AccChapter)
    .createQueryBuilder('a')
    .select(
      [
        'year',
        'chapter',
        'article',
        'description',
        'initial_budget',
        'adjusted_budget',
        'spent',
      ].map((c) => `a.${c} AS ${c}`),
    )
    .getRawMany();
}

export function accCommitments(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(AccCommitment)
    .createQueryBuilder('a')
    .select(
      [
        ...COMMITMENT_KEY,
        'fiscal_year',
        'chapter',
        'article',
        'supplier_vat',
        'amount',
        'cig',
        'cancelled',
        'description',
      ].map((c) => `a.${c} AS ${c}`),
    )
    .getRawMany();
}

export function accLiquidations(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(AccLiquidation)
    .createQueryBuilder('a')
    .select(
      [
        'liquidation_key',
        ...COMMITMENT_KEY,
        'fiscal_year',
        'sdi_identifier',
        'invoice_number',
        'invoice_total',
        'invoice_cig',
        'supplier_vat',
        'amount',
        'cancelled',
        'liquidation_number',
        'mandate_number',
        'paid_amount',
      ].map((c) => `a.${c} AS ${c}`),
    )
    .addSelect(ymd('a.invoice_date'), 'invoice_date')
    .addSelect(ymd('a.mandate_date'), 'mandate_date')
    .addSelect(ymd('a.paid_date'), 'paid_date')
    .getRawMany();
}

export function accCreditNotes(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(AccCreditNote)
    .createQueryBuilder('a')
    .select(
      [
        'link_key',
        'fiscal_year',
        'amount',
        'supplier_vat',
        'note_sdi_identifier',
        'note_number',
        'note_total',
        'invoice_sdi_identifier',
        'invoice_number',
        'invoice_total',
      ].map((c) => `a.${c} AS ${c}`),
    )
    .addSelect(ymd('a.note_date'), 'note_date')
    .addSelect(ymd('a.invoice_date'), 'invoice_date')
    .getRawMany();
}

export async function accCounts(
  m: EntityManager,
): Promise<Record<'chapters' | 'commitments' | 'liquidations' | 'credit_notes', number>> {
  const [chapters, commitments, liquidations, credit_notes] = await Promise.all([
    m.getRepository(AccChapter).count(),
    m.getRepository(AccCommitment).count(),
    m.getRepository(AccLiquidation).count(),
    m.getRepository(AccCreditNote).count(),
  ]);
  return { chapters, commitments, liquidations, credit_notes };
}

// Svuota una tabella di appoggio dentro la transazione del caricamento (mai TRUNCATE:
// in MySQL chiude la transazione).
export async function clearTable(
  m: EntityManager,
  entity: EntityTarget<ObjectLiteral>,
): Promise<void> {
  await m.createQueryBuilder().delete().from(entity).execute();
}

// --- Anagrafiche ---

// Fornitori del perimetro: soggetti terzi con almeno un contratto di fornitura
// (stessa regola dell'import PEC).
export function suppliersInScope(m: EntityManager): Promise<{ id: number; vat: string }[]> {
  return thirdParties(m)
    .andWhere(
      `EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = t.id AND c.deleted = 0 AND ${NOT_DRAFT_SQL('c')})`,
    )
    .getRawMany();
}

// Qualsiasi soggetto terzo non cancellato con P.IVA o codice fiscale.
export function partiesWithVat(m: EntityManager): Promise<{ id: number; vat: string }[]> {
  return thirdParties(m).getRawMany();
}

const thirdParties = (m: EntityManager) =>
  m
    .createQueryBuilder()
    .select('t.id', 'id')
    .addSelect(PARTY_VAT, 'vat')
    .from('third_parties', 't')
    .where(`t.deleted = 0 AND ${PARTY_VAT} IS NOT NULL`);

export function liveChapters(
  m: EntityManager,
): Promise<{ id: number; chapter_code: string; article: number }[]> {
  return m.getRepository(BudgetChapter).find({
    select: { id: true, chapter_code: true, article: true },
    where: { deleted: false },
  }) as never;
}

// Contratti di fornitura non in bozza con CIG.
export function contractsWithCig(
  m: EntityManager,
): Promise<{ id: number; supplier_id_fk: number; cig_contract: string }[]> {
  return m
    .createQueryBuilder()
    .select(['c.id AS id', 'c.supplier_id_fk AS supplier_id_fk', 'c.cig_contract AS cig_contract'])
    .from('contracts', 'c')
    .where(`c.deleted = 0 AND ${NOT_DRAFT_SQL('c')} AND c.cig_contract IS NOT NULL`)
    .getRawMany();
}

// --- Capitoli ---

export function liveSpending(m: EntityManager): Promise<CurrentSpending[]> {
  return m
    .getRepository(BudgetChapterSpending)
    .createQueryBuilder('s')
    .select(
      [
        'id',
        'budget_chapter_id_fk',
        'year',
        'initial_budget',
        'adjusted_budget',
        'amount',
        'source',
      ].map((c) => `s.${c} AS ${c}`),
    )
    .where('s.deleted = 0')
    .getRawMany();
}

// Liquidato per capitolo e anno di competenza: liquidazioni valide sulle
// annualità degli impegni del file.
export function liquidatedByChapter(
  m: EntityManager,
): Promise<{ chapter: string; article: number; fiscal_year: number; total: string }[]> {
  return m
    .getRepository(AccLiquidation)
    .createQueryBuilder('l')
    .select(['c.chapter AS chapter', 'c.article AS article', 'l.fiscal_year AS fiscal_year'])
    .addSelect('SUM(l.amount)', 'total')
    .innerJoin(
      (sub) =>
        sub
          .select(
            [...COMMITMENT_KEY, 'fiscal_year', 'chapter', 'article'].map((c) => `a.${c} AS ${c}`),
          )
          .distinct(true)
          .from(AccCommitment, 'a'),
      'c',
      COMMITMENT_KEY.concat('fiscal_year')
        .map((k) => `c.${k} = l.${k}`)
        .join(' AND '),
    )
    .where('l.cancelled = 0')
    .groupBy('c.chapter')
    .addGroupBy('c.article')
    .addGroupBy('l.fiscal_year')
    .getRawMany();
}

// --- Impegni ---

const nullableNumber = (v: number | string | null): number | null =>
  v === null ? null : Number(v);

// Impegni non cancellati con le annualità (preimpegni con i numeri a null).
export async function currentCommitments(m: EntityManager): Promise<CurrentCommitment[]> {
  const commitments = await m.getRepository(BudgetCommitment).find({
    select: {
      id: true,
      commitment_year: true,
      commitment_num: true,
      commitment_sub: true,
      budget_chapter_id_fk: true,
      supplier_id_fk: true,
      source: true,
    },
    where: { deleted: false },
  });
  const years = commitments.length
    ? await m.getRepository(BudgetCommitmentYear).find({
        select: { commitment_id: true, fiscal_year: true, amount: true, source: true },
        where: { commitment_id: In(commitments.map((c) => c.id)) },
      })
    : [];
  return commitments.map((c) => ({
    id: Number(c.id),
    commitment_year: nullableNumber(c.commitment_year),
    commitment_num: nullableNumber(c.commitment_num),
    commitment_sub: nullableNumber(c.commitment_sub),
    budget_chapter_id_fk: Number(c.budget_chapter_id_fk),
    supplier_id_fk: nullableNumber(c.supplier_id_fk),
    source: c.source,
    years: years
      .filter((y) => Number(y.commitment_id) === Number(c.id))
      .map((y) => ({
        fiscal_year: Number(y.fiscal_year),
        amount: nullableNumber(y.amount),
        source: y.source,
      })),
  }));
}

// Annualità della contabilità: nuove o aggiornate (importo e origine).
export async function upsertYears(
  m: EntityManager,
  commitmentId: number,
  years: { fiscal_year: number; amount: number | null }[],
): Promise<void> {
  await m
    .createQueryBuilder()
    .insert()
    .into(BudgetCommitmentYear)
    .values(
      years.map((y) => ({
        commitment_id: commitmentId,
        fiscal_year: y.fiscal_year,
        amount: y.amount,
        source: RecordSource.ACCOUNTING,
      })),
    )
    .orUpdate(['amount', 'source'], ['commitment_id', 'fiscal_year'])
    .execute();
}

// Fatture divise a mano su un impegno (o sue annualità) che sparisce: via tutte le
// loro quote a mano, anche sugli altri impegni, così tornano all'automatico.
export async function dropManualSplits(
  m: EntityManager,
  commitmentId: number,
  years?: number[],
): Promise<void> {
  const shares = m.getRepository(InvoiceCommitmentShare);
  const split = await shares.find({
    select: { invoice_id_fk: true },
    where: {
      commitment_id_fk: commitmentId,
      source: 'MANUAL' as never,
      ...(years ? { fiscal_year: In(years) } : {}),
    },
  });
  const invoiceIds = [...new Set(split.map((s) => Number(s.invoice_id_fk)))];
  if (invoiceIds.length)
    await shares.delete({ invoice_id_fk: In(invoiceIds), source: 'MANUAL' as never });
}

// Quote automatiche e a mano dell'impegno (o di sue annualità), tolte prima della
// cancellazione: le fatture tornano all'automatico col ricalcolo.
export async function dropCommitmentShares(
  m: EntityManager,
  commitmentId: number,
  years?: number[],
): Promise<void> {
  await m.getRepository(InvoiceCommitmentShare).delete({
    commitment_id_fk: commitmentId,
    source: In(['AUTO', 'MANUAL']) as never,
    ...(years ? { fiscal_year: In(years) } : {}),
  });
}

export async function dropYears(
  m: EntityManager,
  commitmentId: number,
  years: number[],
): Promise<void> {
  await m
    .getRepository(BudgetCommitmentYear)
    .delete({ commitment_id: commitmentId, fiscal_year: In(years) });
}

// Impegni con numero (le quote ACCOUNTING vanno solo su quelli).
export function numberedCommitments(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(BudgetCommitment)
    .createQueryBuilder('bc')
    .select(['id', ...COMMITMENT_KEY].map((c) => `bc.${c} AS ${c}`))
    .where('bc.deleted = 0 AND bc.commitment_num IS NOT NULL')
    .getRawMany();
}

// Impegni creati o aggiornati dalla contabilità.
export function accountingCommitments(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(BudgetCommitment)
    .createQueryBuilder('bc')
    .select(['id', ...COMMITMENT_KEY].map((c) => `bc.${c} AS ${c}`))
    .where('bc.deleted = 0 AND bc.source = :source', { source: RecordSource.ACCOUNTING })
    .getRawMany();
}

// --- Quote ---

export function allShares(m: EntityManager): Promise<CurrentShare[]> {
  return m
    .getRepository(InvoiceCommitmentShare)
    .createQueryBuilder('s')
    .select(
      ['invoice_id_fk', 'commitment_id_fk', 'fiscal_year', 'amount', 'source'].map(
        (c) => `s.${c} AS ${c}`,
      ),
    )
    .getRawMany();
}

// Quote della fattura sostituite da quelle della contabilità (nessuna = tolte solo le ACCOUNTING).
export async function replaceShares(
  m: EntityManager,
  invoiceId: number,
  shares: { commitment_id_fk: number; fiscal_year: number; amount: number }[],
): Promise<void> {
  const repo = m.getRepository(InvoiceCommitmentShare);
  if (!shares.length) {
    await repo.delete({ invoice_id_fk: invoiceId, source: RecordSource.ACCOUNTING as never });
    return;
  }
  await repo.delete({ invoice_id_fk: invoiceId });
  await repo.insert(
    shares.map((s) => ({
      invoice_id_fk: invoiceId,
      commitment_id_fk: s.commitment_id_fk,
      fiscal_year: s.fiscal_year,
      amount: s.amount,
      source: RecordSource.ACCOUNTING as never,
    })),
  );
}

// --- Collegamenti ---

export function commitmentContracts(m: EntityManager): Promise<Row[]> {
  return m
    .createQueryBuilder()
    .select(['l.commitment_id AS commitment_id', 'l.contract_id AS contract_id'])
    .from('budget_commitment_contracts', 'l')
    .getRawMany();
}

const accountingShares = (m: EntityManager) =>
  m
    .getRepository(InvoiceCommitmentShare)
    .createQueryBuilder('s')
    .innerJoin(Invoice, 'i', 'i.id = s.invoice_id_fk')
    .where('s.source = :source AND i.deleted = 0', { source: RecordSource.ACCOUNTING });

// Contratti delle fatture pagate, per impegno.
export function paidContracts(m: EntityManager): Promise<Row[]> {
  return accountingShares(m)
    .select(['s.commitment_id_fk AS commitment_id', 'i.contratto_id_fk AS contract_id'])
    .distinct(true)
    .andWhere('i.contratto_id_fk IS NOT NULL')
    .getRawMany();
}

// Utenze delle righe delle fatture pagate, con capitolo e anno delle quote.
export function paidUtilityChapters(m: EntityManager): Promise<Row[]> {
  return accountingShares(m)
    .select([
      'l.utility_id_fk AS utility_id',
      's.fiscal_year AS fiscal_year',
      'bc.budget_chapter_id_fk AS chapter_id',
    ])
    .distinct(true)
    .innerJoin(BudgetCommitment, 'bc', 'bc.id = s.commitment_id_fk')
    .innerJoin('invoice_lines', 'l', 'l.invoice_id_fk = i.id')
    .andWhere('l.utility_id_fk IS NOT NULL')
    .getRawMany();
}

export function utilityChapters(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(Utility)
    .createQueryBuilder('u')
    .select(['u.id AS id', 'u.budget_chapter_code_fk AS budget_chapter_code_fk'])
    .where('u.deleted = 0')
    .getRawMany();
}

export async function linkContracts(
  m: EntityManager,
  commitmentId: number,
  contractIds: number[],
): Promise<void> {
  await m
    .createQueryBuilder()
    .insert()
    .into('budget_commitment_contracts', ['commitment_id', 'contract_id'])
    .values(contractIds.map((contract_id) => ({ commitment_id: commitmentId, contract_id })))
    .execute();
}

export async function setUtilityChapter(
  m: EntityManager,
  utilityId: number,
  chapterId: number,
  userId: number,
): Promise<void> {
  await m.update(Utility, utilityId, {
    budget_chapter_code_fk: chapterId,
    updated_by_user_id: userId,
  });
}

// --- Fatture e pagamenti ---

// Fatture valide (non cancellate né rifiutate) per l'abbinamento alle liquidazioni.
export function matchableInvoices(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .select(['i.id AS id', `${PARTY_VAT} AS supplier_vat`, 'i.invoice_id AS invoice_number'])
    .addSelect(ymd('i.invoice_date'), 'invoice_date')
    .addSelect('i.sdi_identifier', 'sdi_identifier')
    .leftJoin('third_parties', 't', 't.id = i.supplier_id_fk')
    .where(`i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`)
    .getRawMany();
}

// Messaggi PEC con l'IdentificativoSdI, per lo stato SDI.
export function sdiMessages(m: EntityManager, sdiIdentifier: string): Promise<Row[]> {
  return m.getRepository(SdiMessage).find({
    select: { kind: true, outcome: true, status: true, received_at: true, create_date: true },
    where: { sdi_identifier: sdiIdentifier },
  }) as never;
}

// Tutte le fatture, con l'esclusione dai pagamenti (cancellate o rifiutate).
export function paymentInvoices(m: EntityManager): Promise<Row[]> {
  return m
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .select(['i.id AS id', 'i.total_amount AS total_amount', 'i.payment_status AS payment_status'])
    .addSelect(ymd('i.invoice_date'), 'invoice_date')
    .addSelect(`(i.deleted = 1 OR NOT ${NOT_REJECTED_SQL('i')})`, 'excluded')
    .addSelect(ymd('i.paid_on'), 'paid_on')
    .getRawMany();
}

// Fattura di ogni liquidazione: tutte azzerate, poi quelle abbinate (a blocchi).
export async function clearLiquidationInvoices(m: EntityManager): Promise<void> {
  await m
    .createQueryBuilder()
    .update(AccLiquidation)
    .set({ invoice_id_fk: null } as never)
    .execute();
}

export async function setLiquidationInvoices(
  m: EntityManager,
  links: [key: string, invoiceId: number][],
): Promise<void> {
  const params: Record<string, unknown> = { keys: links.map(([key]) => key) };
  const cases = links
    .map(([key, invoiceId], i) => {
      params[`k${i}`] = key;
      params[`v${i}`] = invoiceId;
      return `WHEN :k${i} THEN :v${i}`;
    })
    .join(' ');
  await m
    .createQueryBuilder()
    .update(AccLiquidation)
    .set({ invoice_id_fk: () => `CASE liquidation_key ${cases} END` } as never)
    .where('liquidation_key IN (:...keys)')
    .setParameters(params)
    .execute();
}

// Stato del pagamento: scrittura di sistema, «Ultima modifica» invariata.
export async function setPaymentStatus(
  m: EntityManager,
  ids: number[],
  status: string | null,
  paidOn: string | null,
): Promise<void> {
  await m
    .createQueryBuilder()
    .update(Invoice)
    .set({ payment_status: status, paid_on: paidOn, update_date: () => 'update_date' } as never)
    .whereInIds(ids)
    .execute();
}
