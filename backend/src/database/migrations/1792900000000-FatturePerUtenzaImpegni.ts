import { MigrationInterface, QueryRunner } from 'typeorm';

// Fatture per utenza e impegni di spesa (roadmap voci 6 e 17). Solo schema:
// invoice_budget_chapter (mai usata) si toglie, il capitolo arriva
// dall'impegno della riga. Controllo prima di ogni DDL (commit implicito).
export class FatturePerUtenzaImpegni1792900000000 implements MigrationInterface {
  name = 'FatturePerUtenzaImpegni1792900000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: number | string }[] = await q.query(
      'SELECT COUNT(*) AS n FROM `invoice_budget_chapter`',
    );
    if (Number(n) > 0) {
      throw new Error(
        `invoice_budget_chapter: ${Number(n)} righe. Ricollegarle come righe fattura con impegno (o cancellarle) prima di rilanciare la migration.`,
      );
    }
    await q.query(
      'CREATE TABLE `budget_commitments` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`contract_id_fk` int NOT NULL, ' +
        '`budget_chapter_id_fk` int NOT NULL, ' +
        '`fiscal_year` int NOT NULL, ' +
        '`commitment_number` varchar(50) NULL, ' +
        '`amount` decimal(14,2) NULL, ' +
        '`notes` text NULL, ' +
        '`create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`created_by_user_id` int NOT NULL, ' +
        '`updated_by_user_id` int NOT NULL, ' +
        '`deleted` tinyint NOT NULL DEFAULT 0, ' +
        'INDEX `IDX_budget_commitments_contract` (`contract_id_fk`, `deleted`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_budget_commitments_contract` FOREIGN KEY (`contract_id_fk`) REFERENCES `contracts`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_chapter` FOREIGN KEY (`budget_chapter_id_fk`) REFERENCES `budget_chapters`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `invoice_lines` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`invoice_id_fk` int NOT NULL, ' +
        '`amount` decimal(14,2) NOT NULL, ' +
        '`utility_id_fk` int NULL, ' +
        '`commitment_id_fk` int NULL, ' +
        '`period_start` date NULL, ' +
        '`period_end` date NULL, ' +
        '`consumption` decimal(14,3) NULL, ' +
        '`supply_code` varchar(50) NULL, ' +
        '`description` varchar(255) NULL, ' +
        'INDEX `IDX_invoice_lines_utility` (`utility_id_fk`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_invoice_lines_invoice` FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE CASCADE, ' +
        'CONSTRAINT `FK_invoice_lines_utility` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`), ' +
        'CONSTRAINT `FK_invoice_lines_commitment` FOREIGN KEY (`commitment_id_fk`) REFERENCES `budget_commitments`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query('ALTER TABLE `invoices` ADD `supplier_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `invoices` ADD CONSTRAINT `FK_invoices_supplier` FOREIGN KEY (`supplier_id_fk`) REFERENCES `third_parties`(`id`)',
    );
    await q.query('ALTER TABLE `invoices` ADD `total_amount` decimal(18,2) NULL');
    await q.query('ALTER TABLE `invoices` MODIFY `net_amount_excl_vat` decimal(18,2) NULL');
    await q.query('DROP TABLE `invoice_budget_chapter`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `invoice_budget_chapter` (' +
        '`invoice_id` int NOT NULL, `budget_chapter_id` int NOT NULL, ' +
        'INDEX `FK_9cffdf1bcf101d43271ac87c53d` (`budget_chapter_id`), ' +
        'PRIMARY KEY (`invoice_id`, `budget_chapter_id`), ' +
        'CONSTRAINT `FK_891310b3d845fe3f7d00346e65b` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE, ' +
        'CONSTRAINT `FK_9cffdf1bcf101d43271ac87c53d` FOREIGN KEY (`budget_chapter_id`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE' +
        ') ENGINE=InnoDB',
    );
    await q.query(
      'UPDATE `invoices` SET `net_amount_excl_vat` = 0 WHERE `net_amount_excl_vat` IS NULL',
    );
    await q.query(
      "ALTER TABLE `invoices` MODIFY `net_amount_excl_vat` decimal(18,2) NOT NULL DEFAULT '0.00'",
    );
    await q.query('ALTER TABLE `invoices` DROP COLUMN `total_amount`');
    await q.query('ALTER TABLE `invoices` DROP FOREIGN KEY `FK_invoices_supplier`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `supplier_id_fk`');
    await q.query('DROP TABLE `invoice_lines`');
    await q.query('DROP TABLE `budget_commitments`');
  }
}
