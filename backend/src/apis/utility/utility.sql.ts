import { EntityManager } from 'typeorm';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';

// SQL a mano: il contratto corrente di ogni utenza si sceglie con ROW_NUMBER() OVER
// (PARTITION BY utenza), che il QueryBuilder di TypeORM non esprime se non come stringa.

// Contratto corrente: prima quelli già partiti (o senza data d'inizio), il più recente;
// uno che parte in futuro solo se non ce n'è un altro (ordine nuovo firmato in anticipo).
export const CURRENT_CONTRACT_ORDER =
  'ORDER BY (c.supply_start_date IS NOT NULL AND c.supply_start_date > CURDATE()), c.supply_start_date DESC, c.id DESC';

// Contratti candidati (alias `c`): non chiusi, non bozze, non scaduti.
export const CURRENT_CONTRACT_FILTER = `c.closed = 0 AND ${NOT_DRAFT_SQL('c')} AND (c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE())`;

// Coppie utenza → contratto corrente, per le utenze date (non vuote).
export function currentContractPairs(
  manager: EntityManager,
  utilityIds: number[],
): Promise<{ utility_id: number; contract_id: number }[]> {
  return manager.query(
    `SELECT ranked.utility_id, ranked.contract_id FROM (
       SELECT cu.utility_id, c.id AS contract_id,
              ROW_NUMBER() OVER (PARTITION BY cu.utility_id ${CURRENT_CONTRACT_ORDER}) AS rn
       FROM contract_utilities cu
       INNER JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
       WHERE cu.utility_id IN (?) AND ${CURRENT_CONTRACT_FILTER}
     ) ranked WHERE ranked.rn = 1`,
    [utilityIds],
  );
}
