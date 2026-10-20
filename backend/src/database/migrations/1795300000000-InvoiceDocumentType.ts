import { MigrationInterface, QueryRunner } from 'typeorm';

// Import fatture dalla PEC: tipo documento sul messaggio (completato dall'import
// per i messaggi già registrati, rileggendo la PEC) e pattern separati per le
// note di credito (TD04, TD08), che non hanno consumi.
export class InvoiceDocumentType1795300000000 implements MigrationInterface {
  name = 'InvoiceDocumentType1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `sdi_messages` ADD `document_type` varchar(4) NULL');
    await q.query('ALTER TABLE `invoice_patterns` ADD `credit_note` tinyint NOT NULL DEFAULT 0');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoice_patterns` DROP COLUMN `credit_note`');
    await q.query('ALTER TABLE `sdi_messages` DROP COLUMN `document_type`');
  }
}
