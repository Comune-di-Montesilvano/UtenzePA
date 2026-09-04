import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillContractData1788508105626 implements MigrationInterface {
  name = 'BackfillContractData1788508105626';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1 riga Contratto per ogni Utility con almeno un campo contrattuale valorizzato.
    await queryRunner.query(`
      INSERT INTO contracts (
        supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id,
        supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date,
        security_deposit, created_by_user_id, updated_by_user_id, deleted
      )
      SELECT
        supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id,
        supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date,
        security_deposit, created_by_user_id, updated_by_user_id, deleted
      FROM utilities
      WHERE supplier_id_fk IS NOT NULL
         OR cig_contract IS NOT NULL
         OR order_number IS NOT NULL
         OR consip_order IS NOT NULL
         OR consip_agreement_id IS NOT NULL
         OR supply_start_date IS NOT NULL
         OR supply_expiry_date IS NOT NULL
         OR management_expiry_date IS NOT NULL
         OR takeover_termination_date IS NOT NULL
         OR security_deposit > 0
    `);

    // Associazione 1:1 contratto↔utenza appena creata: join per posizione tramite
    // una CTE che numera utilities e contracts nello stesso ordine di inserimento
    // (id crescente su entrambi i lati, stesso WHERE della INSERT sopra).
    await queryRunner.query(`
      INSERT INTO contract_utilities (contract_id, utility_id)
      SELECT c.id, u.id
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM utilities
        WHERE supplier_id_fk IS NOT NULL
           OR cig_contract IS NOT NULL
           OR order_number IS NOT NULL
           OR consip_order IS NOT NULL
           OR consip_agreement_id IS NOT NULL
           OR supply_start_date IS NOT NULL
           OR supply_expiry_date IS NOT NULL
           OR management_expiry_date IS NOT NULL
           OR takeover_termination_date IS NOT NULL
           OR security_deposit > 0
      ) u
      JOIN (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM contracts
      ) c ON c.rn = u.rn
    `);

    // invoices.contratto_id_fk risolto dal contratto appena creato per la stessa utenza.
    await queryRunner.query(`
      UPDATE invoices i
      JOIN contract_utilities cu ON cu.utility_id = i.utility_id_fk
      SET i.contratto_id_fk = cu.contract_id
      WHERE i.utility_id_fk IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE invoices SET contratto_id_fk = NULL`);
    await queryRunner.query(`DELETE FROM contract_utilities`);
    await queryRunner.query(`DELETE FROM contracts`);
  }
}
