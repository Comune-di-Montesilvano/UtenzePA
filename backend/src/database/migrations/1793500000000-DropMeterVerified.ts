import { MigrationInterface, QueryRunner } from 'typeorm';

// "Contatore verificato" del vecchio software (utenza localizzata): sostituito
// dall'anomalia calcolata active_utilities_without_position. Il down() ricrea
// la colonna ma non i valori.
export class DropMeterVerified1793500000000 implements MigrationInterface {
  name = 'DropMeterVerified1793500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `meter_verified`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `utilities` ADD `meter_verified` tinyint(1) NULL DEFAULT '0' AFTER `meter_removed`",
    );
  }
}
