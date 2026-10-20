import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture: letture del contatore lette in fattura come rilevazioni a data,
// collegate alla fattura (tolte se la fattura è rifiutata o eliminata).
export class InvoiceReadings1795400000000 implements MigrationInterface {
  name = 'InvoiceReadings1795400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utility_consumptions` ADD `invoice_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utility_consumptions` ADD CONSTRAINT `FK_utility_consumptions_invoice` FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `utility_consumptions` DROP FOREIGN KEY `FK_utility_consumptions_invoice`',
    );
    await q.query('ALTER TABLE `utility_consumptions` DROP COLUMN `invoice_id_fk`');
  }
}
