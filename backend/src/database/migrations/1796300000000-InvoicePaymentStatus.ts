import { MigrationInterface, QueryRunner } from 'typeorm';

// Stato del pagamento dalla contabilità: mandati delle liquidazioni
// (liquidazioni.csv), fattura abbinata a ogni liquidazione e stato sulla
// fattura (da liquidare / liquidata / pagata), scritti dal passo payments.
export class InvoicePaymentStatus1796300000000 implements MigrationInterface {
  name = 'InvoicePaymentStatus1796300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `acc_liquidations` ADD `liquidation_number` varchar(30) NULL, ' +
        'ADD `mandate_number` varchar(30) NULL, ADD `mandate_date` date NULL, ADD `paid_date` date NULL, ' +
        'ADD `paid_amount` decimal(14,2) NULL, ADD `invoice_id_fk` int NULL',
    );
    await q.query(
      'CREATE INDEX `IDX_acc_liquidations_invoice_id` ON `acc_liquidations` (`invoice_id_fk`)',
    );
    await q.query(
      'ALTER TABLE `invoices` ADD `payment_status` varchar(20) NULL, ADD `paid_on` date NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoices` DROP COLUMN `paid_on`, DROP COLUMN `payment_status`');
    await q.query('DROP INDEX `IDX_acc_liquidations_invoice_id` ON `acc_liquidations`');
    await q.query(
      'ALTER TABLE `acc_liquidations` DROP COLUMN `invoice_id_fk`, DROP COLUMN `paid_amount`, ' +
        'DROP COLUMN `paid_date`, DROP COLUMN `mandate_date`, DROP COLUMN `mandate_number`, ' +
        'DROP COLUMN `liquidation_number`',
    );
  }
}
