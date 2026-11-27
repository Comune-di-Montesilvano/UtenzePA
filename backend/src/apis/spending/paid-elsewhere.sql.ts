import { EntityManager } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';

// SQL a mano: CTE con UNION e saldi per fattura e capitolo (GREATEST su
// aggregati), che il QueryBuilder non compone.

type Row = Record<string, unknown>;

// Quota di ogni riga pagata su un capitolo diverso da quello della sua utenza.
// Per fattura e capitolo: saldo = quote d'impegno sul capitolo − righe delle
// utenze del capitolo. Le righe di un capitolo in difetto sono pagate altrove
// per la parte scoperta, ripartita tra i capitoli in eccesso; una fattura
// multi-POD divisa correttamente tra i capitoli non dà nulla. Utenza senza
// capitolo: riga intera ripartita sui capitoli in eccesso.
// `invoiceFilter` = condizione costante su `i` (i valori vanno nei parametri).
function elsewhereCte(invoiceFilter: string): string {
  return `WITH inv AS (
       SELECT i.id FROM invoices i
        WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} AND ${NOT_OFFSET_SQL('i')} AND ${invoiceFilter}),
     sh AS (
       SELECT s.invoice_id_fk AS invoice_id, bc.budget_chapter_id_fk AS chapter_id, SUM(s.amount) AS amount
         FROM invoice_commitment_shares s
         JOIN inv ON inv.id = s.invoice_id_fk
         JOIN budget_commitments bc ON bc.id = s.commitment_id_fk
        GROUP BY s.invoice_id_fk, bc.budget_chapter_id_fk),
     own AS (
       SELECT l.invoice_id_fk AS invoice_id, u.budget_chapter_code_fk AS chapter_id, SUM(l.amount) AS amount
         FROM invoice_lines l
         JOIN inv ON inv.id = l.invoice_id_fk
         JOIN utilities u ON u.id = l.utility_id_fk
        WHERE u.budget_chapter_code_fk IS NOT NULL
        GROUP BY l.invoice_id_fk, u.budget_chapter_code_fk),
     keyset AS (SELECT invoice_id, chapter_id FROM sh UNION SELECT invoice_id, chapter_id FROM own),
     bal AS (
       SELECT k.invoice_id, k.chapter_id, own.amount AS own_amount,
              COALESCE(sh.amount, 0) - COALESCE(own.amount, 0) AS diff
         FROM keyset k
         LEFT JOIN sh ON sh.invoice_id = k.invoice_id AND sh.chapter_id = k.chapter_id
         LEFT JOIN own ON own.invoice_id = k.invoice_id AND own.chapter_id = k.chapter_id),
     ex AS (
       SELECT invoice_id, SUM(GREATEST(diff, 0)) AS total FROM bal GROUP BY invoice_id HAVING total > 0),
     elsewhere AS (
       SELECT l.invoice_id_fk AS invoice_id, l.utility_id_fk AS utility_id, l.amount,
              l.period_start, l.period_end, cx.chapter_id,
              (CASE WHEN u.budget_chapter_code_fk IS NULL THEN 1
                    ELSE GREATEST(-bk.diff, 0) / bk.own_amount END) * cx.diff / ex.total AS share
         FROM invoice_lines l
         JOIN inv ON inv.id = l.invoice_id_fk
         JOIN utilities u ON u.id = l.utility_id_fk AND u.deleted = 0
         JOIN ex ON ex.invoice_id = l.invoice_id_fk
         JOIN bal cx ON cx.invoice_id = l.invoice_id_fk AND cx.diff > 0
         LEFT JOIN bal bk ON bk.invoice_id = l.invoice_id_fk AND bk.chapter_id = u.budget_chapter_code_fk
        WHERE (u.budget_chapter_code_fk IS NULL OR bk.diff < 0)
          AND cx.chapter_id <> COALESCE(u.budget_chapter_code_fk, -1))`;
}

// Utenze con fatture degli ultimi 365 giorni pagate su altri capitoli (anomalia).
export function utilitiesPaidOnOtherChapters(m: EntityManager): Promise<Row[]> {
  return m.query(
    `${elsewhereCte('i.invoice_date >= CURDATE() - INTERVAL 365 DAY')}
     SELECT u.id, u.utility_id,
            GROUP_CONCAT(DISTINCT CONCAT(ch.chapter_code, '/', ch.article) ORDER BY ch.chapter_code SEPARATOR ', ') AS chapters,
            ROUND(SUM(e.amount * e.share), 2) AS amount
       FROM elsewhere e
       JOIN utilities u ON u.id = e.utility_id AND u.budget_chapter_code_fk IS NOT NULL
       JOIN budget_chapters ch ON ch.id = e.chapter_id
      GROUP BY u.id, u.utility_id
     HAVING amount > 1
      ORDER BY u.utility_id`,
  );
}

// Righe dell'utenza nel periodo con la quota (0..1) pagata su ogni altro capitolo.
export function utilityLinesElsewhere(
  m: EntityManager,
  utilityId: number,
  start: string,
  end: string,
): Promise<Row[]> {
  return m.query(
    `${elsewhereCte('i.id IN (SELECT invoice_id_fk FROM invoice_lines WHERE utility_id_fk = ?)')}
     SELECT e.amount, DATE_FORMAT(e.period_start, '%Y-%m-%d') AS period_start,
            DATE_FORMAT(e.period_end, '%Y-%m-%d') AS period_end,
            DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
            e.chapter_id, CONCAT(ch.chapter_code, '/', ch.article) AS chapter_label, e.share
       FROM elsewhere e
       JOIN invoices i ON i.id = e.invoice_id
       JOIN budget_chapters ch ON ch.id = e.chapter_id
      WHERE e.utility_id = ?
        AND COALESCE(e.period_end, e.period_start, i.invoice_date) >= ?
        AND COALESCE(e.period_start, e.period_end, i.invoice_date) <= ?`,
    [utilityId, utilityId, start, end],
  );
}
