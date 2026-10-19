import { MigrationInterface, QueryRunner } from 'typeorm';

// Rilevazioni stimate dal fornitore (roadmap voce 23): le esistenti sono reali.
export class ConsumptionEstimated1794900000000 implements MigrationInterface {
  name = 'ConsumptionEstimated1794900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utility_consumptions` ADD `is_estimated` tinyint NOT NULL DEFAULT 0');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utility_consumptions` DROP COLUMN `is_estimated`');
  }
}
