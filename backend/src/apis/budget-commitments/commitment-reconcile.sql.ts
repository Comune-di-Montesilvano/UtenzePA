import { EntityManager } from 'typeorm';

// SQL a mano: la quota automatica si scrive con un INSERT … SELECT condizionato,
// in un solo statement, così una quota a mano salvata nel frattempo non lascia
// quote miste; il QueryBuilder non esprime un INSERT con WHERE NOT EXISTS.

const AUTO_INSERT_SQL =
  'INSERT INTO invoice_commitment_shares (invoice_id_fk, commitment_id_fk, fiscal_year, amount, source) ' +
  "SELECT ?, ?, ?, ?, 'AUTO' FROM DUAL WHERE NOT EXISTS " +
  "(SELECT 1 FROM invoice_commitment_shares WHERE invoice_id_fk = ? AND source <> 'AUTO')";

export async function insertAutoShare(
  m: EntityManager,
  invoiceId: number,
  share: { commitment_id: number; fiscal_year: number | null; amount: number },
): Promise<void> {
  await m.query(AUTO_INSERT_SQL, [
    invoiceId,
    share.commitment_id,
    share.fiscal_year,
    share.amount,
    invoiceId,
  ]);
}
