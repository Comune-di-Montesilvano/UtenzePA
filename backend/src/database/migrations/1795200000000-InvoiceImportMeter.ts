import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture dalla PEC: segnalazioni con utenza e valore trovato in fattura
// (matricola diversa = import fermo finché non si risolve) e rilettura della
// casella dall'inizio per registrare i file SDI dei trasmittenti esteri, prima
// scartati (i messaggi già registrati si saltano).
export class InvoiceImportMeter1795200000000 implements MigrationInterface {
  name = 'InvoiceImportMeter1795200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoice_import_issues` ADD `utility_id_fk` int NULL');
    await q.query('ALTER TABLE `invoice_import_issues` ADD `value` varchar(100) NULL');
    await q.query(
      'ALTER TABLE `invoice_import_issues` ADD CONSTRAINT `FK_invoice_import_issues_utility` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await q.query('UPDATE `invoice_import_state` SET `last_uid` = NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `invoice_import_issues` DROP FOREIGN KEY `FK_invoice_import_issues_utility`',
    );
    await q.query('ALTER TABLE `invoice_import_issues` DROP COLUMN `value`');
    await q.query('ALTER TABLE `invoice_import_issues` DROP COLUMN `utility_id_fk`');
  }
}
