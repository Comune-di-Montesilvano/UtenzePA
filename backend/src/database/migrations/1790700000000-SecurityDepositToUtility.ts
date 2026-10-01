import { MigrationInterface, QueryRunner } from 'typeorm';

// Deposito cauzionale: dato del punto di fornitura (es. ACA lo chiede per
// contatore), non del contratto. Copiato dai contratti attivi sulle utenze
// collegate (ogni contratto con deposito copre una sola utenza), poi rimosso
// dal contratto.
export class SecurityDepositToUtility1790700000000 implements MigrationInterface {
  name = 'SecurityDepositToUtility1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD \`security_deposit\` decimal(10,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `UPDATE \`utilities\` u
       JOIN \`contract_utilities\` cu ON cu.\`utility_id\` = u.\`id\`
       JOIN \`contracts\` c ON c.\`id\` = cu.\`contract_id\` AND c.\`deleted\` = 0
       SET u.\`security_deposit\` = c.\`security_deposit\`, u.\`update_date\` = u.\`update_date\`
       WHERE c.\`security_deposit\` > 0`,
    );
    await queryRunner.query(`ALTER TABLE \`contracts\` DROP COLUMN \`security_deposit\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contracts\` ADD \`security_deposit\` decimal(10,2) NOT NULL DEFAULT '0.00'`,
    );
    // Lossy: un contratto con più utenze riceve il deposito massimo tra esse.
    await queryRunner.query(
      `UPDATE \`contracts\` c
       JOIN (SELECT cu.\`contract_id\`, MAX(u.\`security_deposit\`) AS deposit
             FROM \`contract_utilities\` cu JOIN \`utilities\` u ON u.\`id\` = cu.\`utility_id\`
             GROUP BY cu.\`contract_id\`) x ON x.\`contract_id\` = c.\`id\`
       SET c.\`security_deposit\` = x.deposit, c.\`update_date\` = c.\`update_date\``,
    );
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`security_deposit\``);
  }
}
