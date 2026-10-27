import { MigrationInterface, QueryRunner } from 'typeorm';

// Import contabilità, fase 4 (container Tinn): ultimo caricamento riuscito, per
// la segnalazione accounting_import_stale, e impronta dell'ultimo backup
// caricato, che il container legge per non ripristinare due volte lo stesso.
export class AccountingImportLastSuccess1796200000000 implements MigrationInterface {
  name = 'AccountingImportLastSuccess1796200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `accounting_import_state` ADD `last_success_at` datetime NULL, ' +
        'ADD `last_loaded_sha256` varchar(64) NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `accounting_import_state` DROP COLUMN `last_loaded_sha256`, DROP COLUMN `last_success_at`',
    );
  }
}
