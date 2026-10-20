import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture dalla PEC: tipo documento sul messaggio (completato dall'import
// per i messaggi già registrati, rileggendo la PEC) e pattern separati per tipo
// (TD01 fattura, TD02 acconto, TD04 nota di credito…); i pattern esistenti sono fatture.
export class InvoiceDocumentType1795300000000 implements MigrationInterface {
  name = 'InvoiceDocumentType1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `sdi_messages` ADD `document_type` varchar(4) NULL');
    await q.query(
      "ALTER TABLE `invoice_patterns` ADD `document_type` varchar(4) NOT NULL DEFAULT 'TD01'",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoice_patterns` DROP COLUMN `document_type`');
    await q.query('ALTER TABLE `sdi_messages` DROP COLUMN `document_type`');
  }
}
