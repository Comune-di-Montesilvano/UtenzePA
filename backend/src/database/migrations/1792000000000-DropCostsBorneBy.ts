import { MigrationInterface, QueryRunner } from 'typeorm';

// "Costi a carico di" scritto a mano sostituito da voltura + stato calcolato
// (roadmap voce 12, apis/utility/cost-status.ts). Solo schema.
export class DropCostsBorneBy1792000000000 implements MigrationInterface {
  name = 'DropCostsBorneBy1792000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_ac19dbfc5a05c425d326d14548e`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `costs_borne_by_id_fk`');
    await q.query('DROP TABLE `costs_borne_by`');
  }

  // Ricrea la struttura vuota (colonna nullable): i valori non si ricostruiscono.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `costs_borne_by` (`id` int NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `IDX_028a7f4037aa13be201677526e` (`name`), INDEX `IDX_a1b3689b160116241e4de0ee34` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `costs_borne_by` ADD CONSTRAINT `FK_a1b3689b160116241e4de0ee341` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `costs_borne_by` ADD CONSTRAINT `FK_e17b17ff1598741dfab09add67a` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `utilities` ADD `costs_borne_by_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_ac19dbfc5a05c425d326d14548e` FOREIGN KEY (`costs_borne_by_id_fk`) REFERENCES `costs_borne_by`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
