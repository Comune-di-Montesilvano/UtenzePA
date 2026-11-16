import { EntityManager } from 'typeorm';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { lineYearSql } from './line-year';

// SQL a mano: le voci di spesa per capitolo sono una tabella derivata con UNION ALL
// (quote d'impegno + righe delle fatture senza quote), che il QueryBuilder non
// esprime; la stessa tabella serve a scheda capitolo, elenco capitoli, controllo
// del bilancio, capitoli del contratto e anomalie (chaptersYearSummary).

type Row = Record<string, unknown>;

// Voci di spesa per capitolo (ci): quote d'impegno della fattura (capitolo
// dell'impegno, esercizio = annualità della quota) e, per le fatture senza
// quote, le righe (capitolo dell'utenza, competenza del periodo della riga,
// line-year.ts). Solo fatture valide (join con invoices i in coda); stornate e
// note di credito della contabilità escluse (in ragioneria non toccano il
// capitolo: la fattura si liquida al netto).
const CHAPTER_ITEMS = `FROM (
    SELECT s.id AS share_id, NULL AS line_id, s.invoice_id_fk AS invoice_id, NULL AS utility_id,
           bcm.budget_chapter_id_fk AS chapter_id, s.fiscal_year AS year, s.amount
      FROM invoice_commitment_shares s
      JOIN budget_commitments bcm ON bcm.id = s.commitment_id_fk
    UNION ALL
    SELECT NULL, il.id, il.invoice_id_fk, il.utility_id_fk, u.budget_chapter_code_fk,
           ${lineYearSql({ line: 'il', invoice: 'li' })}, il.amount
      FROM invoice_lines il
      JOIN invoices li ON li.id = il.invoice_id_fk
      LEFT JOIN utilities u ON u.id = il.utility_id_fk
     WHERE NOT EXISTS (SELECT 1 FROM invoice_commitment_shares x WHERE x.invoice_id_fk = il.invoice_id_fk)
  ) ci
  JOIN invoices i ON i.id = ci.invoice_id AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
    AND ${NOT_OFFSET_SQL('i')}`;

// Fatturato del capitolo per esercizio.
export function chapterInvoiced(m: EntityManager, chapterId: number): Promise<Row[]> {
  return m.query(
    `SELECT ci.year, SUM(ci.amount) AS total, COUNT(DISTINCT ci.invoice_id) AS invoices
     ${CHAPTER_ITEMS} WHERE ci.chapter_id = ? GROUP BY ci.year`,
    [chapterId],
  );
}

// Fatturato dell'esercizio per capitolo.
export function yearInvoiced(m: EntityManager, year: number): Promise<Row[]> {
  return m.query(
    `SELECT ci.chapter_id, SUM(ci.amount) AS total, COUNT(DISTINCT ci.invoice_id) AS invoices
     ${CHAPTER_ITEMS}
     WHERE ci.year = ? AND ci.chapter_id IS NOT NULL
     GROUP BY ci.chapter_id`,
    [year],
  );
}

// Voci del capitolo con fattura, fornitore e utenza, dalla più recente.
export function chapterItems(m: EntityManager, chapterId: number): Promise<Row[]> {
  return m.query(
    `SELECT ci.share_id, ci.line_id, i.id AS invoice_id, i.invoice_id AS number,
            DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
            ${partyNameSql('tp')} AS supplier, u.id AS utility_id, u.utility_id AS utility_code,
            ci.year, ci.amount
     ${CHAPTER_ITEMS}
     LEFT JOIN third_parties tp ON tp.id = i.supplier_id_fk
     LEFT JOIN utilities u ON u.id = ci.utility_id
     WHERE ci.chapter_id = ?
     ORDER BY i.invoice_date DESC, i.id DESC, ci.share_id, ci.line_id`,
    [chapterId],
  );
}

// Fatturato del capitolo nell'esercizio, senza la fattura indicata (0 = nessuna).
export async function chapterYearInvoiced(
  m: EntityManager,
  chapterId: number,
  year: number,
  exceptInvoiceId: number,
): Promise<number> {
  const [{ total }] = await m.query(
    `SELECT COALESCE(SUM(ci.amount), 0) AS total ${CHAPTER_ITEMS}
     WHERE ci.chapter_id = ? AND ci.year = ? AND i.id <> ?`,
    [chapterId, year, exceptInvoiceId],
  );
  return Number(total);
}

// Speso delle fatture del contratto per capitolo ed esercizio.
export function contractSpent(m: EntityManager, contractId: number): Promise<Row[]> {
  return m.query(
    `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description,
            ci.year, SUM(ci.amount) AS total
     ${CHAPTER_ITEMS}
     LEFT JOIN budget_chapters b ON b.id = ci.chapter_id
     WHERE i.contratto_id_fk = ?
     GROUP BY b.id, b.chapter_code, b.article, b.description, ci.year ORDER BY ci.year DESC`,
    [contractId],
  );
}
