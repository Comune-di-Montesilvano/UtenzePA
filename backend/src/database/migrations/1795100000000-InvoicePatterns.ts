import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture dalla PEC SDI, parte 2: pattern per fornitore, differenze
// trovate dall'import, collegamenti messaggio → pattern/fattura e riga →
// rilevazione, blocco delle fatture importate modificate a mano.
export class InvoicePatterns1795100000000 implements MigrationInterface {
  name = 'InvoicePatterns1795100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "CREATE TABLE `invoice_patterns` (`id` int NOT NULL AUTO_INCREMENT, `supplier_id_fk` int NOT NULL, `name` varchar(100) NOT NULL, `ignored` tinyint NOT NULL DEFAULT 0, `rules` json NULL, `structure_key` varchar(40) NOT NULL, `paths_count` int NOT NULL DEFAULT '0', `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, INDEX `IDX_invoice_patterns_supplier` (`supplier_id_fk`, `deleted`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await q.query(
      'CREATE TABLE `invoice_import_issues` (`id` int NOT NULL AUTO_INCREMENT, `sdi_message_id_fk` int NOT NULL, `invoice_id_fk` int NULL, `line_index` int NULL, `type` varchar(30) NOT NULL, `detail` varchar(500) NOT NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_invoice_import_issues_message` (`sdi_message_id_fk`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query('ALTER TABLE `invoice_lines` ADD `consumption_id_fk` int NULL');
    await q.query('ALTER TABLE `invoices` ADD `import_locked` tinyint NOT NULL DEFAULT 0');
    await q.query('ALTER TABLE `sdi_messages` ADD `structure_key` varchar(40) NULL');
    await q.query('ALTER TABLE `sdi_messages` ADD `pattern_id_fk` int NULL');
    await q.query('ALTER TABLE `sdi_messages` ADD `invoice_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `invoice_lines` ADD CONSTRAINT `FK_invoice_lines_consumption` FOREIGN KEY (`consumption_id_fk`) REFERENCES `utility_consumptions`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_patterns` ADD CONSTRAINT `FK_invoice_patterns_supplier` FOREIGN KEY (`supplier_id_fk`) REFERENCES `third_parties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_patterns` ADD CONSTRAINT `FK_invoice_patterns_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_patterns` ADD CONSTRAINT `FK_invoice_patterns_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `sdi_messages` ADD CONSTRAINT `FK_sdi_messages_pattern` FOREIGN KEY (`pattern_id_fk`) REFERENCES `invoice_patterns`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `sdi_messages` ADD CONSTRAINT `FK_sdi_messages_invoice` FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_import_issues` ADD CONSTRAINT `FK_invoice_import_issues_message` FOREIGN KEY (`sdi_message_id_fk`) REFERENCES `sdi_messages`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_import_issues` ADD CONSTRAINT `FK_invoice_import_issues_invoice` FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `invoice_import_issues` DROP FOREIGN KEY `FK_invoice_import_issues_invoice`',
    );
    await q.query(
      'ALTER TABLE `invoice_import_issues` DROP FOREIGN KEY `FK_invoice_import_issues_message`',
    );
    await q.query('ALTER TABLE `sdi_messages` DROP FOREIGN KEY `FK_sdi_messages_invoice`');
    await q.query('ALTER TABLE `sdi_messages` DROP FOREIGN KEY `FK_sdi_messages_pattern`');
    await q.query('ALTER TABLE `invoice_patterns` DROP FOREIGN KEY `FK_invoice_patterns_updated_by`');
    await q.query('ALTER TABLE `invoice_patterns` DROP FOREIGN KEY `FK_invoice_patterns_created_by`');
    await q.query('ALTER TABLE `invoice_patterns` DROP FOREIGN KEY `FK_invoice_patterns_supplier`');
    await q.query('ALTER TABLE `invoice_lines` DROP FOREIGN KEY `FK_invoice_lines_consumption`');
    await q.query('ALTER TABLE `sdi_messages` DROP COLUMN `invoice_id_fk`');
    await q.query('ALTER TABLE `sdi_messages` DROP COLUMN `pattern_id_fk`');
    await q.query('ALTER TABLE `sdi_messages` DROP COLUMN `structure_key`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `import_locked`');
    await q.query('ALTER TABLE `invoice_lines` DROP COLUMN `consumption_id_fk`');
    await q.query('DROP TABLE `invoice_import_issues`');
    await q.query('DROP TABLE `invoice_patterns`');
  }
}
