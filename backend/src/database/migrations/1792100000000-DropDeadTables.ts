import { MigrationInterface, QueryRunner } from 'typeorm';

// Tabelle morte (roadmap voce 18): fk_test (residuo di prove, senza entity) e
// aca_keys (mai usata, avrebbe tenuto credenziali in chiaro). Solo schema.
export class DropDeadTables1792100000000 implements MigrationInterface {
  name = 'DropDeadTables1792100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `fk_test`');
    await q.query('DROP TABLE IF EXISTS `aca_keys`');
  }

  // Ricrea le strutture vuote.
  public async down(q: QueryRunner): Promise<void> {
    await q.query('CREATE TABLE `fk_test` (`id` int NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await q.query(
      'CREATE TABLE `aca_keys` (`id` int NOT NULL AUTO_INCREMENT, `username` varchar(100) NOT NULL, `password` varchar(255) NOT NULL, `utility_id` int NULL, `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX `REL_a23304180e4457edc6e985c8a7` (`utility_id`), INDEX `IDX_8a11ef487d5449dc70defd8bf1` (`created_by_user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_a23304180e4457edc6e985c8a73` FOREIGN KEY (`utility_id`) REFERENCES `utilities`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_8a11ef487d5449dc70defd8bf17` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `aca_keys` ADD CONSTRAINT `FK_d3445744fbdb002ec5d9abaf3ab` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
