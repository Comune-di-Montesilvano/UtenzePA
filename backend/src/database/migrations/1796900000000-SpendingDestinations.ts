import { MigrationInterface, QueryRunner } from 'typeorm';

// Capitoli per destinazione di spesa (v1.62.0): anagrafica delle destinazioni,
// destinazione su immobili, impianti e capitoli, natura del capitolo e origine
// del capitolo dell'utenza (DERIVED dal ricalcolo, MANUAL a mano). Nessuna FK
// sulle destinazioni: si cancellano in modo logico.
export class SpendingDestinations1796900000000 implements MigrationInterface {
  name = 'SpendingDestinations1796900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `spending_destinations` (`id` int NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `notes` text NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `spending_destinations` ADD CONSTRAINT `FK_38a4356400005fa9d16c6a9d6f4` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `spending_destinations` ADD CONSTRAINT `FK_d31f3d9317bd74c3912a1da1b24` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `assets` ADD `spending_destination_id` int NULL');
    await q.query('ALTER TABLE `plants` ADD `spending_destination_id` int NULL');
    await q.query('ALTER TABLE `budget_chapters` ADD `spending_destination_id` int NULL');
    await q.query('ALTER TABLE `budget_chapters` ADD `hard_type` varchar(20) NULL');
    await q.query(
      "ALTER TABLE `utilities` ADD `chapter_source` varchar(10) NOT NULL DEFAULT 'MANUAL'",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `chapter_source`');
    await q.query('ALTER TABLE `budget_chapters` DROP COLUMN `hard_type`');
    await q.query('ALTER TABLE `budget_chapters` DROP COLUMN `spending_destination_id`');
    await q.query('ALTER TABLE `plants` DROP COLUMN `spending_destination_id`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `spending_destination_id`');
    await q.query('DROP TABLE `spending_destinations`');
  }
}
