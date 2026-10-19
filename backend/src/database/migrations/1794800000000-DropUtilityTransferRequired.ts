import { MigrationInterface, QueryRunner } from 'typeorm';

// «Da volturare» deciso sull'utenza sostituito dalle decisioni sui contratti
// e dallo storico fornitura (apis/utility-supply): la colonna non serve più.
export class DropUtilityTransferRequired1794800000000 implements MigrationInterface {
  name = 'DropUtilityTransferRequired1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transfer_required`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `transfer_required` tinyint NULL');
  }
}
