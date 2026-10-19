import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture dalla PEC SDI (roadmap voce 6, parte 1): registro dei file SDI,
// stato del motore (spento finché un Admin non lo accende) e campi SDI sulle fatture.
export class InvoiceImport1795000000000 implements MigrationInterface {
  name = 'InvoiceImport1795000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "CREATE TABLE `invoice_import_state` (`id` int NOT NULL DEFAULT '1', `enabled` tinyint NOT NULL DEFAULT 0, `uid_validity` bigint NULL, `last_uid` bigint NULL, `last_run_at` datetime NULL, `last_success_at` datetime NULL, `last_error` varchar(500) NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await q.query('INSERT INTO `invoice_import_state` (`id`, `enabled`) VALUES (1, 0)');
    await q.query(
      'CREATE TABLE `sdi_messages` (`id` int NOT NULL AUTO_INCREMENT, `uid_validity` bigint NOT NULL, `uid` bigint NOT NULL, `message_id` varchar(255) NOT NULL, `received_at` datetime NULL, `kind` varchar(10) NOT NULL, `file_name` varchar(255) NOT NULL, `sdi_identifier` varchar(20) NULL, `outcome` varchar(4) NULL, `supplier_vat` varchar(16) NULL, `supplier_id_fk` int NULL, `document_number` varchar(255) NULL, `document_date` date NULL, `status` varchar(20) NOT NULL, `error` varchar(500) NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_sdi_messages_identifier` (`sdi_identifier`), UNIQUE INDEX `UQ_sdi_messages_file` (`message_id`, `file_name`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `sdi_messages` ADD CONSTRAINT `FK_sdi_messages_supplier` FOREIGN KEY (`supplier_id_fk`) REFERENCES `third_parties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `invoices` ADD `sdi_identifier` varchar(20) NULL');
    await q.query('ALTER TABLE `invoices` ADD `sdi_status` varchar(20) NULL');
    await q.query('ALTER TABLE `invoices` ADD `sdi_outcome_discarded` tinyint NOT NULL DEFAULT 0');
    await q.query('CREATE INDEX `IDX_invoices_sdi_identifier` ON `invoices` (`sdi_identifier`)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX `IDX_invoices_sdi_identifier` ON `invoices`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `sdi_outcome_discarded`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `sdi_status`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `sdi_identifier`');
    await q.query('ALTER TABLE `sdi_messages` DROP FOREIGN KEY `FK_sdi_messages_supplier`');
    await q.query('DROP TABLE `sdi_messages`');
    await q.query('DROP TABLE `invoice_import_state`');
  }
}
