import { MigrationInterface, QueryRunner } from 'typeorm';

// Segnalazioni dell'import fatture silenziabili a mano (es. dati dal PDF non trovati
// in un caso isolato e registrati a mano).
export class ImportIssueMuted1795500000000 implements MigrationInterface {
  name = 'ImportIssueMuted1795500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `invoice_import_issues` ADD `muted` tinyint NOT NULL DEFAULT 0',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoice_import_issues` DROP COLUMN `muted`');
  }
}
