import { MigrationInterface, QueryRunner } from 'typeorm';

// Da volturare deciso sulla singola utenza (null = come da contratto
// immobiliare). Nessun dato: tutte le utenze restano come da contratto.
export class UtilityTransferRequired1793900000000 implements MigrationInterface {
  name = 'UtilityTransferRequired1793900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `transfer_required` tinyint NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transfer_required`');
  }
}
