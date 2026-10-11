import { MigrationInterface, QueryRunner } from 'typeorm';

// Complessi (voce 2 roadmap, fase 1): tabella complexes, assets.complex_id
// (un immobile in al massimo un complesso), foto anche sui complessi.
// Nessun dato: i complessi nascono con l'import MEF (fase 3) o dalla UI.
export class Complexes1793600000000 implements MigrationInterface {
  name = 'Complexes1793600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "CREATE TABLE `complexes` (`id` int NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `complex_type` enum ('SOCIAL_HOUSING_BUILDING', 'RESIDENTIAL_BUILDING', 'OFFICE_BUILDING', 'OTHER_BUILDING', 'SPORTS_RECREATIONAL', 'SCHOOL_UNIVERSITY', 'MILITARY', 'HEALTHCARE', 'HISTORIC_CULTURAL', 'OTHER_COMPLEX', 'LAND_ONLY') NULL, `toponym` varchar(255) NULL, `address` varchar(255) NULL, `civic_number` varchar(50) NULL, `latitude` varchar(20) NULL, `longitude` varchar(20) NULL, `mef_compendium_id` int NULL, `notes` text NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_c5931eab4980ea98ceb841e088` (`mef_compendium_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await q.query(
      'ALTER TABLE `complexes` ADD CONSTRAINT `FK_8930599d6a4d1b143532eebefbb` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `complexes` ADD CONSTRAINT `FK_2e7574cc233e6e43b512b448f71` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `assets` ADD `complex_id` int NULL');
    await q.query(
      'ALTER TABLE `assets` ADD CONSTRAINT `FK_99f0740a2d01d06787cce3f0401` FOREIGN KEY (`complex_id`) REFERENCES `complexes`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await q.query(
      "ALTER TABLE `photos` MODIFY `entity_type` enum ('asset', 'utility', 'plant', 'complex') NOT NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `photos` WHERE `entity_type` = 'complex'");
    await q.query(
      "ALTER TABLE `photos` MODIFY `entity_type` enum ('asset', 'utility', 'plant') NOT NULL",
    );
    await q.query('ALTER TABLE `assets` DROP FOREIGN KEY `FK_99f0740a2d01d06787cce3f0401`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `complex_id`');
    await q.query('ALTER TABLE `complexes` DROP FOREIGN KEY `FK_2e7574cc233e6e43b512b448f71`');
    await q.query('ALTER TABLE `complexes` DROP FOREIGN KEY `FK_8930599d6a4d1b143532eebefbb`');
    await q.query('DROP TABLE `complexes`');
  }
}
