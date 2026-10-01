import { MigrationInterface, QueryRunner } from 'typeorm';

// Spesa storica per capitolo (budget_chapter_spending) e impianti termici
// degli immobili (thermal_plants).
export class ThermalPlantsSpending1790900000000 implements MigrationInterface {
  name = 'ThermalPlantsSpending1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`budget_chapter_spending\` (\`id\` int NOT NULL AUTO_INCREMENT, \`budget_chapter_id_fk\` int NOT NULL, \`year\` int NOT NULL, \`amount\` decimal(14,2) NOT NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_aaef5255f437d42ff8dcf070dd\` (\`budget_chapter_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`thermal_plants\` (\`id\` int NOT NULL AUTO_INCREMENT, \`asset_id_fk\` int NOT NULL, \`utility_id_fk\` int NULL, \`name\` varchar(255) NOT NULL, \`power_kw\` decimal(10,2) NULL, \`generators_description\` varchar(255) NULL, \`vvf_certification\` varchar(255) NULL, \`vvf_exempt\` tinyint NOT NULL DEFAULT 0, \`inail_certification\` varchar(255) NULL, \`inail_exempt\` tinyint NOT NULL DEFAULT 0, \`served_area_sqm\` decimal(10,2) NULL, \`water_room\` tinyint NULL, \`outdoor_units\` int NULL, \`indoor_units\` int NULL, \`fan_coils\` int NULL, \`air_handling_units\` int NULL, \`chillers_heat_pumps\` int NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_d8d5d15e470003d25089337231\` (\`utility_id_fk\`, \`deleted\`), INDEX \`IDX_4cafc983fc317d66409b3c067d\` (\`asset_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` ADD CONSTRAINT \`FK_d25fd4276d3171751179a4cb32e\` FOREIGN KEY (\`budget_chapter_id_fk\`) REFERENCES \`budget_chapters\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` ADD CONSTRAINT \`FK_481a74540a97ed17b7eb68a6351\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` ADD CONSTRAINT \`FK_a864b37a50a09a1d9f9e02c4ae7\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` ADD CONSTRAINT \`FK_cb9c9ba73627474552b8b7a3fbd\` FOREIGN KEY (\`asset_id_fk\`) REFERENCES \`assets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` ADD CONSTRAINT \`FK_17451304ad97f7e3c194edf2663\` FOREIGN KEY (\`utility_id_fk\`) REFERENCES \`utilities\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` ADD CONSTRAINT \`FK_77f830a807c3c6af5b0e81cea78\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` ADD CONSTRAINT \`FK_41dae0508b1b3d3ab2954b9a7de\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` DROP FOREIGN KEY \`FK_41dae0508b1b3d3ab2954b9a7de\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` DROP FOREIGN KEY \`FK_77f830a807c3c6af5b0e81cea78\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` DROP FOREIGN KEY \`FK_17451304ad97f7e3c194edf2663\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`thermal_plants\` DROP FOREIGN KEY \`FK_cb9c9ba73627474552b8b7a3fbd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` DROP FOREIGN KEY \`FK_a864b37a50a09a1d9f9e02c4ae7\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` DROP FOREIGN KEY \`FK_481a74540a97ed17b7eb68a6351\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`budget_chapter_spending\` DROP FOREIGN KEY \`FK_d25fd4276d3171751179a4cb32e\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_4cafc983fc317d66409b3c067d\` ON \`thermal_plants\``);
    await queryRunner.query(`DROP INDEX \`IDX_d8d5d15e470003d25089337231\` ON \`thermal_plants\``);
    await queryRunner.query(`DROP TABLE \`thermal_plants\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_aaef5255f437d42ff8dcf070dd\` ON \`budget_chapter_spending\``,
    );
    await queryRunner.query(`DROP TABLE \`budget_chapter_spending\``);
  }
}
