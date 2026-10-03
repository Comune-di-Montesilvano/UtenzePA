import { MigrationInterface, QueryRunner } from 'typeorm';

// Aggregati utenze eliminati (roadmap voce 11): l'informazione è nei
// collegamenti a immobili (funzione) e impianti (tipo). Solo schema.
export class DropUtilityAggregators1791900000000 implements MigrationInterface {
  name = 'DropUtilityAggregators1791900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_dba61ce41b0c75fe41d95eb23e5`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `aggregator_id_fk`');
    await q.query('DROP TABLE `utility_aggregators`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `utility_aggregators` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(255) NOT NULL, `description` varchar(255) NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_fd45c271920bc9a24a05904b5c` (`code`), INDEX `IDX_6add3a6a97364646ac3ac95afb` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `utility_aggregators` ADD CONSTRAINT `FK_6add3a6a97364646ac3ac95afb8` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `utility_aggregators` ADD CONSTRAINT `FK_8a237573bbd76c2beaee579d5a2` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `aggregator_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_dba61ce41b0c75fe41d95eb23e5` FOREIGN KEY (`aggregator_id_fk`) REFERENCES `utility_aggregators`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
