import { EntityManager } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
// Pagate su altri capitoli: query condivisa con la scheda utenza.
export { utilitiesPaidOnOtherChapters } from '@apis/spending/paid-elsewhere.sql';

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
