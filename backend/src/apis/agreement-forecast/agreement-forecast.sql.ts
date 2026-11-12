import { NOT_OFFSET_SQL } from '@apis/invoices/enum/payment-status.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { COMMITMENT_SPENT, COMMITMENTS } from '@apis/spending/chapter-year';

// Query del fabbisogno della convenzione (parametri posizionali). «Ordine» =
// contratto di fornitura non cancellato della convenzione, bozze e chiusi
// compresi: l'orizzonte comprende anche gli ordini conclusi. Il collegamento
// tra impegni, fatture e convenzione passa sempre dal contratto, mai dal
// codice di gara.

const day = (col: string): string => `DATE_FORMAT(${col}, '%Y-%m-%d')`;

// Impegno collegato ad almeno un ordine della convenzione (?).
const OF_AGREEMENT = `EXISTS (SELECT 1 FROM budget_commitment_contracts bcc
    JOIN contracts c ON c.id = bcc.contract_id AND c.deleted = 0
   WHERE bcc.commitment_id = bcm.id AND c.consip_agreement_id = ?)`;

export const AGREEMENT_SQL = 'SELECT a.id FROM consip_agreement a WHERE a.id = ? AND a.deleted = 0';

export const ORDERS_SQL = `SELECT c.id, c.draft, c.closed,
    ${day('c.supply_start_date')} AS supply_start, ${day('c.supply_expiry_date')} AS supply_end
  FROM contracts c
 WHERE c.deleted = 0 AND c.consip_agreement_id = ?`;

export const ORDER_UTILITIES_SQL = `SELECT cu.contract_id, cu.utility_id
  FROM contract_utilities cu
  JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
 WHERE c.consip_agreement_id = ?`;

export const UTILITIES_SQL = `SELECT u.id, u.utility_id AS utility_code, t.hard_type,
    u.budget_chapter_code_fk AS chapter_id, u.estimated_annual_consumption
  FROM utilities u
  LEFT JOIN utility_types t ON t.id = u.utility_type_id_fk
 WHERE u.id IN (?) AND u.deleted = 0`;

// Righe di qualunque fattura valida dell'utenza, fino alla data (?).
export const LINES_SQL = `SELECT il.utility_id_fk AS utility_id, il.amount,
    ${day('il.period_start')} AS period_start, ${day('il.period_end')} AS period_end,
    ${day('i.invoice_date')} AS invoice_date
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
    AND ${NOT_OFFSET_SQL('i')}
 WHERE il.utility_id_fk IN (?) AND i.invoice_date <= ?`;

// Tutte le rilevazioni fino alla data (?): le coppie di letture servono
// anche prima dell'orizzonte.
export const CONSUMPTIONS_SQL = `SELECT uc.id, uc.utility_id_fk AS utility_id, uc.kind,
    ${day('uc.reading_date')} AS reading_date, uc.reading_value, uc.meter_number,
    ${day('uc.period_start')} AS period_start, ${day('uc.period_end')} AS period_end,
    uc.consumption, uc.is_estimated
  FROM utility_consumptions uc
 WHERE uc.utility_id_fk IN (?) AND uc.deleted = 0
   AND COALESCE(uc.period_end, uc.reading_date) <= ?`;

export const EVENTS_SQL = `SELECT e.id, e.utility_id_fk AS utility_id, e.type, e.third_party_id_fk,
    ${day('e.requested_on')} AS requested_on, ${day('e.effective_on')} AS effective_on,
    e.date_unknown, ${day('e.cancelled_on')} AS cancelled_on, e.utilizer_grant_id_fk,
    e.deleted, e.create_date
  FROM utility_supply_events e
 WHERE e.utility_id_fk IN (?) AND e.deleted = 0`;

// Annualità degli impegni della convenzione per capitolo ed esercizio: ogni
// impegno conta una volta. Rimanenza = importo − tutte le quote già spese,
// qualunque fattura le abbia consumate.
export const COMMITTED_SQL = `SELECT bcm.budget_chapter_id_fk AS chapter_id, bcy.fiscal_year AS year,
    COALESCE(SUM(bcy.amount), 0) AS committed,
    COALESCE(SUM(CASE WHEN bcy.amount IS NULL THEN 0 ELSE bcy.amount - ${COMMITMENT_SPENT} END), 0) AS remaining,
    SUM(bcy.amount IS NULL) AS without_amount
  ${COMMITMENTS}
 WHERE bcm.deleted = 0 AND ${OF_AGREEMENT}
 GROUP BY bcm.budget_chapter_id_fk, bcy.fiscal_year`;

// Impegni della convenzione (?) collegati anche a ordini di un'altra (?):
// contano per intero in entrambe.
export const SHARED_COMMITMENTS_SQL = `SELECT bcm.id, bcm.commitment_year, bcm.commitment_num, bcm.commitment_sub
  FROM budget_commitments bcm
 WHERE bcm.deleted = 0 AND ${OF_AGREEMENT}
   AND EXISTS (SELECT 1 FROM budget_commitment_contracts bx
        JOIN contracts cx ON cx.id = bx.contract_id AND cx.deleted = 0
       WHERE bx.commitment_id = bcm.id AND cx.consip_agreement_id IS NOT NULL
         AND cx.consip_agreement_id <> ?)`;

// Quote sugli impegni della convenzione di fatture senza righe per utenza
// (canoni): riducono la rimanenza ma i loro giorni restano «da fatturare».
export const SHARES_WITHOUT_LINES_SQL = `SELECT s.fiscal_year AS year, SUM(s.amount) AS amount
  FROM invoice_commitment_shares s
  JOIN invoices i ON i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
  JOIN budget_commitments bcm ON bcm.id = s.commitment_id_fk AND bcm.deleted = 0
 WHERE ${OF_AGREEMENT}
   AND NOT EXISTS (SELECT 1 FROM invoice_lines il
        WHERE il.invoice_id_fk = i.id AND il.utility_id_fk IS NOT NULL)
 GROUP BY s.fiscal_year`;

export const CHAPTERS_SQL =
  'SELECT b.id, b.chapter_code, b.article, b.description FROM budget_chapters b WHERE b.id IN (?)';

// Convenzioni da tenere aggiornate: almeno un ordine non chiuso.
export const OPEN_AGREEMENTS_SQL = `SELECT a.id FROM consip_agreement a
 WHERE a.deleted = 0
   AND EXISTS (SELECT 1 FROM contracts c
        WHERE c.consip_agreement_id = a.id AND c.deleted = 0 AND c.closed = 0)`;

export const AGREEMENTS_OF_CONTRACTS_SQL = `SELECT DISTINCT c.consip_agreement_id AS id
  FROM contracts c
 WHERE c.id IN (?) AND c.consip_agreement_id IS NOT NULL`;
