import { MigrationInterface, QueryRunner } from 'typeorm';

// Gestori manutenzione eliminati (roadmap voce 18): sostituiti dalla
// "Manutenzione a carico di" calcolata dai contratti. Solo schema.
export class DropMaintenanceManagers1792400000000 implements MigrationInterface {
  name = 'DropMaintenanceManagers1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_42f396edfa8f09d9dc694e4ddc9`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `maintenance_management_id_fk`');
    await q.query('DROP TABLE `maintenance_managers`');
  }

  // Ricrea la struttura vuota: i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `maintenance_managers` (`id` int NOT NULL AUTO_INCREMENT, `code` varchar(100) NOT NULL, `description` text NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NULL, `updated_by_user_id` int NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_896871741dba2db44c2d08ae8a` (`code`), INDEX `IDX_91641df4170a721a4f9e696071` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `maintenance_managers` ADD CONSTRAINT `FK_91641df4170a721a4f9e696071d` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `maintenance_managers` ADD CONSTRAINT `FK_f19fa975d5bb5c3a90a03289401` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `maintenance_management_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_42f396edfa8f09d9dc694e4ddc9` FOREIGN KEY (`maintenance_management_id_fk`) REFERENCES `maintenance_managers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
