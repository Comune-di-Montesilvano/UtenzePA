import { MigrationInterface, QueryRunner } from 'typeorm';

// Storico consumi utenze + colonne di stato stima/copertura su utilities.
// Le stime già presenti (import storico) vengono trattate come manuali,
// con data = ultima modifica dell'utenza: scadono 12 mesi dopo.
export class UtilityConsumptions1790500000000 implements MigrationInterface {
  name = 'UtilityConsumptions1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`utility_consumptions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`utility_id_fk\` int NOT NULL, \`kind\` enum ('READING', 'PERIOD') NOT NULL, \`reading_date\` date NULL, \`reading_value\` decimal(14,3) NULL, \`meter_number\` varchar(255) NULL, \`period_start\` date NULL, \`period_end\` date NULL, \`consumption\` decimal(14,3) NULL, \`source\` enum ('MANUAL', 'INVOICE', 'IMPORT', 'API') NOT NULL DEFAULT 'MANUAL', \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_ed8f5b94913f1adcd3cf159969\` (\`utility_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_f565435ea4eec4b0253644f44c8\` FOREIGN KEY (\`utility_id_fk\`) REFERENCES \`utilities\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_1fc50b0c481ff3ae2fe9eca4a4a\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_consumptions\` ADD CONSTRAINT \`FK_f9fe28ce5dd8a0dc97e8de8b03d\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD \`estimated_consumption_source\` enum ('MANUAL', 'HISTORY', 'NONE') NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(`ALTER TABLE \`utilities\` ADD \`estimated_consumption_set_at\` datetime NULL`);
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD \`actual_consumption_coverage_days\` int NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `UPDATE \`utilities\` SET \`estimated_consumption_source\` = 'MANUAL', \`estimated_consumption_set_at\` = \`update_date\`, \`update_date\` = \`update_date\` WHERE \`estimated_annual_consumption\` > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`actual_consumption_coverage_days\``);
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`estimated_consumption_set_at\``);
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`estimated_consumption_source\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_f9fe28ce5dd8a0dc97e8de8b03d\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_1fc50b0c481ff3ae2fe9eca4a4a\``);
    await queryRunner.query(`ALTER TABLE \`utility_consumptions\` DROP FOREIGN KEY \`FK_f565435ea4eec4b0253644f44c8\``);
    await queryRunner.query(`DROP TABLE \`utility_consumptions\``);
  }
}
