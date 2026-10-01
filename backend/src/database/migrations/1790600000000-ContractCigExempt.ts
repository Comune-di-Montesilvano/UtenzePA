import { MigrationInterface, QueryRunner } from 'typeorm';

// CIG obbligatorio sui contratti salvo esclusione esplicita (cig_exempt).
// Esclusi d'ufficio i contratti esistenti dei fornitori per cui il CIG non è
// richiesto: ACA (servizio idrico in house) e OPEN FIBER (connettività).
export class ContractCigExempt1790600000000 implements MigrationInterface {
  name = 'ContractCigExempt1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contracts\` ADD \`cig_exempt\` tinyint NOT NULL DEFAULT 0`);
    await queryRunner.query(
      `UPDATE \`contracts\` c JOIN \`suppliers\` s ON s.\`id\` = c.\`supplier_id_fk\` SET c.\`cig_exempt\` = 1, c.\`update_date\` = c.\`update_date\` WHERE s.\`supplier_id\` IN ('ACA', 'OPEN FIBER')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contracts\` DROP COLUMN \`cig_exempt\``);
  }
}
