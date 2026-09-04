import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContract1788504891423 implements MigrationInterface {
  name = 'CreateContract1788504891423';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TABLE `contracts` (`id` int NOT NULL AUTO_INCREMENT, `supplier_id_fk` int NULL, `cig_contract` text NULL, `order_number` text NULL, `consip_order` varchar(100) NULL, `consip_agreement_id` int NULL, `supply_start_date` date NULL, `supply_expiry_date` date NULL, `management_expiry_date` date NULL, `takeover_termination_date` date NULL, `security_deposit` decimal(10,2) NOT NULL DEFAULT '0.00', `create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `created_by_user_id` int NOT NULL, `updated_by_user_id` int NOT NULL, `deleted` tinyint NULL DEFAULT 0, INDEX `IDX_3539f488388f2a3ddd4a45abbe` (`created_by_user_id`), UNIQUE INDEX `REL_4a9b1d7a38f0ff6ce4eb247824` (`consip_agreement_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await queryRunner.query(
      'CREATE TABLE `contract_utilities` (`contract_id` int NOT NULL, `utility_id` int NOT NULL, PRIMARY KEY (`contract_id`, `utility_id`)) ENGINE=InnoDB',
    );
    await queryRunner.query('ALTER TABLE `invoices` ADD `contratto_id_fk` int NULL');
    await queryRunner.query(
      'CREATE INDEX `IDX_85d2825e71c7e216147a0dd73a` ON `contract_utilities` (`contract_id`)',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_4e326a469113167f19437d5c5c` ON `contract_utilities` (`utility_id`)',
    );
    await queryRunner.query(
      'ALTER TABLE `invoices` ADD CONSTRAINT `FK_fb520b9ab1cf9cb34bd02f88a5d` FOREIGN KEY (`contratto_id_fk`) REFERENCES `contracts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contracts` ADD CONSTRAINT `FK_3539f488388f2a3ddd4a45abbe6` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contracts` ADD CONSTRAINT `FK_30a6bb6b4b452ebed2a1479261f` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contracts` ADD CONSTRAINT `FK_3ffd48901e416673c6e4a7b724b` FOREIGN KEY (`supplier_id_fk`) REFERENCES `suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contracts` ADD CONSTRAINT `FK_4a9b1d7a38f0ff6ce4eb2478242` FOREIGN KEY (`consip_agreement_id`) REFERENCES `consip_agreement`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contract_utilities` ADD CONSTRAINT `FK_85d2825e71c7e216147a0dd73af` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `contract_utilities` ADD CONSTRAINT `FK_4e326a469113167f19437d5c5c3` FOREIGN KEY (`utility_id`) REFERENCES `utilities`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `contract_utilities` DROP FOREIGN KEY `FK_4e326a469113167f19437d5c5c3`',
    );
    await queryRunner.query(
      'ALTER TABLE `contract_utilities` DROP FOREIGN KEY `FK_85d2825e71c7e216147a0dd73af`',
    );
    await queryRunner.query('ALTER TABLE `contracts` DROP FOREIGN KEY `FK_4a9b1d7a38f0ff6ce4eb2478242`');
    await queryRunner.query('ALTER TABLE `contracts` DROP FOREIGN KEY `FK_3ffd48901e416673c6e4a7b724b`');
    await queryRunner.query('ALTER TABLE `contracts` DROP FOREIGN KEY `FK_30a6bb6b4b452ebed2a1479261f`');
    await queryRunner.query('ALTER TABLE `contracts` DROP FOREIGN KEY `FK_3539f488388f2a3ddd4a45abbe6`');
    await queryRunner.query('ALTER TABLE `invoices` DROP FOREIGN KEY `FK_fb520b9ab1cf9cb34bd02f88a5d`');
    await queryRunner.query('DROP INDEX `IDX_4e326a469113167f19437d5c5c` ON `contract_utilities`');
    await queryRunner.query('DROP INDEX `IDX_85d2825e71c7e216147a0dd73a` ON `contract_utilities`');
    await queryRunner.query('ALTER TABLE `invoices` DROP COLUMN `contratto_id_fk`');
    await queryRunner.query('DROP TABLE `contract_utilities`');
    await queryRunner.query('DROP INDEX `REL_4a9b1d7a38f0ff6ce4eb247824` ON `contracts`');
    await queryRunner.query('DROP INDEX `IDX_3539f488388f2a3ddd4a45abbe` ON `contracts`');
    await queryRunner.query('DROP TABLE `contracts`');
  }
}
