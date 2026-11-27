import { EntityManager } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';

// SQL a mano: le due letture delle anomalie con una CTE, che il
// QueryBuilder non compone (le altre sono in anomalies.queries.ts).

type Row = Record<string, unknown>;

// SQL a mano: CTE con le chiavi delle fatture normalizzate una volta sola; col
// confronto correlato la REGEXP girava per ogni coppia liquidazione × fattura (40 s).
// Liquidazioni con riferimento a fattura, su impegni di UtenzePA, che non
// trovano fattura né per IdentificativoSdI né per fornitore + numero + data.
export function liquidationsUnmatched(m: EntityManager): Promise<Row[]> {
  return m.query(
    `WITH k AS (
       SELECT DISTINCT i.invoice_date AS invoice_date, COALESCE(NULLIF(t.vat_number, ''), t.tax_code) AS vat,
              TRIM(LEADING '0' FROM REGEXP_REPLACE(UPPER(i.invoice_id), '[^A-Z0-9]', '')) AS number
         FROM invoices i JOIN third_parties t ON t.id = i.supplier_id_fk
        WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')})
     SELECT l.liquidation_key AS id, l.invoice_number AS number, l.invoice_date AS date, l.amount, l.supplier_vat,
            CONCAT(l.commitment_year, '/', l.commitment_num, '/', l.commitment_sub) AS commitment
       FROM acc_liquidations l
       JOIN budget_commitments bc ON bc.deleted = 0 AND bc.commitment_year = l.commitment_year
            AND bc.commitment_num = l.commitment_num AND bc.commitment_sub = l.commitment_sub
      WHERE l.cancelled = 0 AND l.invoice_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
              AND l.sdi_identifier IS NOT NULL AND i.sdi_identifier = l.sdi_identifier)
        AND NOT EXISTS (SELECT 1 FROM k WHERE k.invoice_date = l.invoice_date AND k.vat = l.supplier_vat
              AND k.number = TRIM(LEADING '0' FROM REGEXP_REPLACE(UPPER(l.invoice_number), '[^A-Z0-9]', '')))
      ORDER BY l.invoice_date DESC, l.liquidation_key`,
  );
}

// SQL a mano: CTE con le quote per fattura e capitolo e il loro totale, lette
// insieme alle righe (il QueryBuilder non compone le CTE).
// Utenze con righe di fatture degli ultimi 365 giorni pagate su capitoli diversi
// dal loro: importo = riga × quote sugli altri capitoli / quote totali.
export function utilitiesPaidOnOtherChapters(m: EntityManager): Promise<Row[]> {
  return m.query(
    `WITH sh AS (
       SELECT s.invoice_id_fk AS invoice_id, bc.budget_chapter_id_fk AS chapter_id, SUM(s.amount) AS amount
         FROM invoice_commitment_shares s
         JOIN budget_commitments bc ON bc.id = s.commitment_id_fk
        GROUP BY s.invoice_id_fk, bc.budget_chapter_id_fk),
     tot AS (SELECT invoice_id, SUM(amount) AS total FROM sh GROUP BY invoice_id)
     SELECT u.id, u.utility_id,
            GROUP_CONCAT(DISTINCT CONCAT(ch.chapter_code, '/', ch.article) ORDER BY ch.chapter_code SEPARATOR ', ') AS chapters,
            ROUND(SUM(l.amount * sh.amount / tot.total), 2) AS amount
       FROM invoices i
       JOIN invoice_lines l ON l.invoice_id_fk = i.id
       JOIN utilities u ON u.id = l.utility_id_fk AND u.deleted = 0 AND u.budget_chapter_code_fk IS NOT NULL
       JOIN tot ON tot.invoice_id = i.id AND tot.total <> 0
       JOIN sh ON sh.invoice_id = i.id AND sh.chapter_id <> u.budget_chapter_code_fk
       JOIN budget_chapters ch ON ch.id = sh.chapter_id
      WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} AND ${NOT_OFFSET_SQL('i')}
        AND i.invoice_date >= CURDATE() - INTERVAL 365 DAY
      GROUP BY u.id, u.utility_id
     HAVING amount > 1
      ORDER BY u.utility_id`,
  );
}
