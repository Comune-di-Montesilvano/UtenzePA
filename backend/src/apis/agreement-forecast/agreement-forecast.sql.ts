import { EntityManager } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { COMMITMENT_SPENT, COMMITMENTS } from '@apis/spending/chapter-year';

// SQL a mano: impegnato, rimanenza e quote della convenzione riusano i frammenti SQL
// della spesa per capitolo (COMMITMENTS, COMMITMENT_SPENT in spending/chapter-year.ts),
// così il fabbisogno e la scheda del capitolo contano allo stesso modo. Si convertono
// insieme a quel modulo. Le altre letture sono in agreement-forecast.queries.ts.
// Il collegamento tra impegni e convenzione passa sempre dal contratto, mai dal codice
// di gara.

type Row = Record<string, unknown>;

// Impegno collegato ad almeno un ordine della convenzione (?).
const OF_AGREEMENT = `EXISTS (SELECT 1 FROM budget_commitment_contracts bcc
    JOIN contracts c ON c.id = bcc.contract_id AND c.deleted = 0
   WHERE bcc.commitment_id = bcm.id AND c.consip_agreement_id = ?)`;

// Annualità degli impegni della convenzione per capitolo ed esercizio: ogni
// impegno conta una volta. Rimanenza = importo − tutte le quote già spese,
// qualunque fattura le abbia consumate.
const COMMITTED_SQL = `SELECT bcm.budget_chapter_id_fk AS chapter_id, bcy.fiscal_year AS year,
    COALESCE(SUM(bcy.amount), 0) AS committed,
    COALESCE(SUM(CASE WHEN bcy.amount IS NULL THEN 0 ELSE bcy.amount - ${COMMITMENT_SPENT} END), 0) AS remaining,
    SUM(bcy.amount IS NULL) AS without_amount
  ${COMMITMENTS}
 WHERE bcm.deleted = 0 AND ${OF_AGREEMENT}
 GROUP BY bcm.budget_chapter_id_fk, bcy.fiscal_year`;

// Impegni della convenzione (?) collegati anche a ordini di un'altra (?):
// contano per intero in entrambe.
const SHARED_COMMITMENTS_SQL = `SELECT bcm.id, bcm.commitment_year, bcm.commitment_num, bcm.commitment_sub
  FROM budget_commitments bcm
 WHERE bcm.deleted = 0 AND ${OF_AGREEMENT}
   AND EXISTS (SELECT 1 FROM budget_commitment_contracts bx
        JOIN contracts cx ON cx.id = bx.contract_id AND cx.deleted = 0
       WHERE bx.commitment_id = bcm.id AND cx.consip_agreement_id IS NOT NULL
         AND cx.consip_agreement_id <> ?)`;

// Quote sugli impegni della convenzione di fatture senza righe per utenza
// (canoni): riducono la rimanenza ma i loro giorni restano «da fatturare».
const SHARES_WITHOUT_LINES_SQL = `SELECT s.fiscal_year AS year, SUM(s.amount) AS amount
  FROM invoice_commitment_shares s
  JOIN invoices i ON i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
  JOIN budget_commitments bcm ON bcm.id = s.commitment_id_fk AND bcm.deleted = 0
 WHERE ${OF_AGREEMENT}
   AND NOT EXISTS (SELECT 1 FROM invoice_lines il
        WHERE il.invoice_id_fk = i.id AND il.utility_id_fk IS NOT NULL)
 GROUP BY s.fiscal_year`;

export function committed(m: EntityManager, agreementId: number): Promise<Row[]> {
  return m.query(COMMITTED_SQL, [agreementId]);
}

export function sharedCommitments(m: EntityManager, agreementId: number): Promise<Row[]> {
  return m.query(SHARED_COMMITMENTS_SQL, [agreementId, agreementId]);
}

export function sharesWithoutLines(m: EntityManager, agreementId: number): Promise<Row[]> {
  return m.query(SHARES_WITHOUT_LINES_SQL, [agreementId]);
}
