import { MigrationInterface, QueryRunner } from 'typeorm';

// Concessioni → contratti immobiliari (spec 2026-10-01). grant_date era un
// @CreateDateColumn: tutti i valori sono l'istante di import, quindi si azzera;
// expire_date si conserva dove diverso da create_date. Gli immobili passano
// alla join utilizer_grant_assets.
export class RealEstateContracts1791000000000 implements MigrationInterface {
  name = 'RealEstateContracts1791000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`utilizer\` ADD \`tax_code\` varchar(16) NULL, ADD \`contacts\` text NULL`,
    );

    await q.query(
      `CREATE TABLE \`utilizer_grant_assets\` (\`utilizer_grant_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_426980dca0625ba7788672e89c\` (\`utilizer_grant_id\`), INDEX \`IDX_310066bec57aa4e255951df141\` (\`asset_id\`), PRIMARY KEY (\`utilizer_grant_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_assets\` ADD CONSTRAINT \`FK_426980dca0625ba7788672e89cd\` FOREIGN KEY (\`utilizer_grant_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_assets\` ADD CONSTRAINT \`FK_310066bec57aa4e255951df1410\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `INSERT INTO \`utilizer_grant_assets\` (\`utilizer_grant_id\`, \`asset_id\`) SELECT \`id\`, \`asset_id_fk\` FROM \`utilizer_grant\` WHERE \`asset_id_fk\` IS NOT NULL`,
    );

    await q.query(
      `ALTER TABLE \`utilizer_grant\` ADD \`start_date\` date NULL, ADD \`end_date\` date NULL`,
    );
    await q.query(
      `UPDATE \`utilizer_grant\` SET \`end_date\` = DATE(\`expire_date\`), \`update_date\` = \`update_date\` WHERE \`expire_date\` IS NOT NULL AND \`expire_date\` <> \`create_date\``,
    );
    // utilizer_grant non ha FK né indici su asset_id_fk (verificato con
    // SHOW CREATE TABLE): basta il DROP COLUMN.
    await q.query(
      `ALTER TABLE \`utilizer_grant\` DROP COLUMN \`asset_id_fk\`, DROP COLUMN \`grant_date\`, DROP COLUMN \`expire_date\``,
    );

    await q.query(
      `ALTER TABLE \`utilizer_grant\`
        ADD \`direction\` enum ('ACTIVE','PASSIVE') NOT NULL DEFAULT 'ACTIVE',
        ADD \`kind\` enum ('LEASE','CONCESSION','LOAN_FOR_USE','HOUSING_ASSIGNMENT','LAND_OCCUPATION') NOT NULL DEFAULT 'CONCESSION',
        ADD \`subject\` varchar(500) NULL,
        ADD \`rent_amount\` decimal(12,2) NULL,
        ADD \`rent_period\` enum ('MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','ONE_OFF') NULL,
        ADD \`vat_applicable\` tinyint NOT NULL DEFAULT 0,
        ADD \`tacit_renewal\` tinyint NOT NULL DEFAULT 0,
        ADD \`renewal_months\` int NULL,
        ADD \`notice_months\` int NULL,
        ADD \`status\` enum ('ACTIVE','RETURNED','TERMINATED','DISPUTED') NOT NULL DEFAULT 'ACTIVE',
        ADD \`registration_ref\` varchar(255) NULL,
        ADD \`cadastral_ref\` varchar(255) NULL,
        ADD \`area_sqm\` decimal(10,2) NULL,
        ADD \`department\` varchar(50) NULL,
        ADD \`parent_contract_id\` int NULL,
        ADD \`notes\` text NULL`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant\` ADD CONSTRAINT \`FK_00341d90f42fa36d29519c081b0\` FOREIGN KEY (\`parent_contract_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`utilizer_grant\` DROP FOREIGN KEY \`FK_00341d90f42fa36d29519c081b0\``,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant\` DROP COLUMN \`notes\`, DROP COLUMN \`parent_contract_id\`, DROP COLUMN \`department\`, DROP COLUMN \`area_sqm\`, DROP COLUMN \`cadastral_ref\`, DROP COLUMN \`registration_ref\`, DROP COLUMN \`status\`, DROP COLUMN \`notice_months\`, DROP COLUMN \`renewal_months\`, DROP COLUMN \`tacit_renewal\`, DROP COLUMN \`vat_applicable\`, DROP COLUMN \`rent_period\`, DROP COLUMN \`rent_amount\`, DROP COLUMN \`subject\`, DROP COLUMN \`kind\`, DROP COLUMN \`direction\``,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant\` ADD \`asset_id_fk\` int NULL, ADD \`grant_date\` timestamp NULL, ADD \`expire_date\` timestamp NULL`,
    );
    // Un contratto con più immobili torna al primo.
    await q.query(
      `UPDATE \`utilizer_grant\` g SET g.\`asset_id_fk\` = (SELECT MIN(a.\`asset_id\`) FROM \`utilizer_grant_assets\` a WHERE a.\`utilizer_grant_id\` = g.\`id\`), g.\`expire_date\` = g.\`end_date\``,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant\` DROP COLUMN \`start_date\`, DROP COLUMN \`end_date\``,
    );
    await q.query(`DROP TABLE \`utilizer_grant_assets\``);
    await q.query(`ALTER TABLE \`utilizer\` DROP COLUMN \`contacts\`, DROP COLUMN \`tax_code\``);
  }
}
