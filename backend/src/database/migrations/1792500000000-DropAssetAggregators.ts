import { MigrationInterface, QueryRunner } from 'typeorm';

// Aggregati immobili eliminati (roadmap voce 18): duplicavano la funzione
// dell'immobile, che ha già le icone. Solo schema.
export class DropAssetAggregators1792500000000 implements MigrationInterface {
  name = 'DropAssetAggregators1792500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `assets` DROP FOREIGN KEY `FK_d43ed9e838f74bcc07b1266a8d6`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `asset_type_id`');
    await q.query('DROP TABLE `asset_aggregators`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `asset_aggregators` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(255) NOT NULL, `description` varchar(255) NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, `icon` varchar(50) NULL, UNIQUE INDEX `IDX_1dd8ee2f6760bd4c6cb5bf958b` (`code`), INDEX `IDX_d727f360f8244e6d2fff287536` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `asset_aggregators` ADD CONSTRAINT `FK_d727f360f8244e6d2fff287536b` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `asset_aggregators` ADD CONSTRAINT `FK_b35a2cc9fb0a9df4af08e5173a5` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `assets` ADD `asset_type_id` int NULL');
    await q.query(
      'ALTER TABLE `assets` ADD CONSTRAINT `FK_d43ed9e838f74bcc07b1266a8d6` FOREIGN KEY (`asset_type_id`) REFERENCES `asset_aggregators`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
