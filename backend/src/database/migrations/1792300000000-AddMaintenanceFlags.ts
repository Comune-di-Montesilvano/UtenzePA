import { MigrationInterface, QueryRunner } from 'typeorm';

// "Manutenzione a carico di" (roadmap voce 18): spunte sui due tipi di contratto.
export class AddMaintenanceFlags1792300000000 implements MigrationInterface {
  name = 'AddMaintenanceFlags1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` ADD `maintenance_included` tinyint NOT NULL DEFAULT 0');
    await q.query(
      'ALTER TABLE `utilizer_grant` ADD `maintenance_by_counterparty` tinyint NOT NULL DEFAULT 0',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilizer_grant` DROP COLUMN `maintenance_by_counterparty`');
    await q.query('ALTER TABLE `contracts` DROP COLUMN `maintenance_included`');
  }
}
