import { MigrationInterface, QueryRunner } from 'typeorm';

// Impianti (entità unificata): tabelle plants + dati specifici (termico,
// ascensore, presidi antincendio) + scadenzario verifiche + utility_plants.
// Gli impianti termici v1.6.0 (thermal_plants) confluiscono in plants /
// plant_thermal con lo stesso id (audit log invariato), l'utenza che li
// alimentava diventa una riga utility_plants; thermal_plants viene rimossa.
// Nessuna riclassificazione di immobili: è una migrazione manuale dei dati.
// Nomi vincoli = default TypeORM (DefaultNamingStrategy).
export class Plants1791100000000 implements MigrationInterface {
  name = 'Plants1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`plant_thermal\` (\`plant_id\` int NOT NULL, \`power_kw\` decimal(10,2) NULL, \`generators_description\` varchar(255) NULL, \`vvf_certification\` varchar(255) NULL, \`vvf_exempt\` tinyint NOT NULL DEFAULT 0, \`inail_certification\` varchar(255) NULL, \`inail_exempt\` tinyint NOT NULL DEFAULT 0, \`served_area_sqm\` decimal(10,2) NULL, \`water_room\` tinyint NULL, \`outdoor_units\` int NULL, \`indoor_units\` int NULL, \`fan_coils\` int NULL, \`air_handling_units\` int NULL, \`chillers_heat_pumps\` int NULL, PRIMARY KEY (\`plant_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`plant_elevator\` (\`plant_id\` int NOT NULL, \`serial_number\` varchar(100) NULL, \`plant_number\` varchar(100) NULL, \`manufacturer\` varchar(255) NULL, \`year\` int NULL, \`test_date\` date NULL, \`elevator_type\` varchar(100) NULL, \`drive\` varchar(100) NULL, \`capacity_kg\` int NULL, \`stops\` int NULL, \`speed\` varchar(50) NULL, PRIMARY KEY (\`plant_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`plant_fire_equipment\` (\`id\` int NOT NULL AUTO_INCREMENT, \`plant_id\` int NOT NULL, \`equipment_type\` enum ('EXTINGUISHER', 'HYDRANT', 'HOSE_REEL', 'FIRE_BRIGADE_CONNECTION') NOT NULL, \`serial_number\` varchar(100) NULL, \`agent\` varchar(100) NULL, \`capacity\` varchar(50) NULL, \`location\` varchar(255) NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_1bd07faf38bab12ca8c4b3f498\` (\`plant_id\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`plant_inspections\` (\`id\` int NOT NULL AUTO_INCREMENT, \`plant_id\` int NOT NULL, \`kind\` varchar(150) NOT NULL, \`period_months\` int NULL, \`last_date\` date NULL, \`next_date\` date NULL, \`provider\` varchar(255) NULL, \`outcome\` varchar(255) NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_30293b0e83f6b1704fefd3325a\` (\`plant_id\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`plants\` (\`id\` int NOT NULL AUTO_INCREMENT, \`type\` enum ('THERMAL', 'ELEVATOR', 'FIRE_PROTECTION', 'PHOTOVOLTAIC', 'PUBLIC_LIGHTING', 'TRAFFIC_LIGHT', 'LIFTING_PUMP', 'FOUNTAIN', 'ELECTRICAL_CABIN', 'WATER_KIOSK', 'VIDEO_SURVEILLANCE', 'BIKE_STATION', 'POWER_POINT', 'WATER_POINT', 'SEWAGE', 'IRRIGATION', 'POWERED_STREET_FURNITURE') NOT NULL, \`code\` varchar(100) NOT NULL, \`name\` varchar(255) NOT NULL, \`asset_id_fk\` int NULL, \`toponym\` varchar(255) NULL, \`address\` varchar(255) NULL, \`civic_number\` varchar(50) NULL, \`latitude\` varchar(20) NULL, \`longitude\` varchar(20) NULL, \`geocoded_latitude\` varchar(20) NULL, \`geocoded_longitude\` varchar(20) NULL, \`geocoded_at\` timestamp NULL, \`status\` enum ('ACTIVE', 'DECOMMISSIONED', 'TO_VERIFY') NOT NULL DEFAULT 'ACTIVE', \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_172755cf0a27e671fea1c7d00d\` (\`asset_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`utility_plants\` (\`utility_id\` int NOT NULL, \`plant_id\` int NOT NULL, INDEX \`IDX_26313a5b4f7d4c9ff6fdf965dd\` (\`utility_id\`), INDEX \`IDX_11e35c1ddc49a96f38c9d5a16e\` (\`plant_id\`), PRIMARY KEY (\`utility_id\`, \`plant_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_thermal\` ADD CONSTRAINT \`FK_e1b3952c04a940dee6407c359f3\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_elevator\` ADD CONSTRAINT \`FK_9dcf2d08d863af7405d3282c80e\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_fire_equipment\` ADD CONSTRAINT \`FK_0cbc2a4d31114def8a8fce9db54\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_inspections\` ADD CONSTRAINT \`FK_2c20a49b7e90d591f416f9dace2\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` ADD CONSTRAINT \`FK_277174dffd55273b0b17207d9bf\` FOREIGN KEY (\`asset_id_fk\`) REFERENCES \`assets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` ADD CONSTRAINT \`FK_631e233bb1ab899d992868bd2af\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` ADD CONSTRAINT \`FK_683e611cc12e56647cbf9459542\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_plants\` ADD CONSTRAINT \`FK_26313a5b4f7d4c9ff6fdf965dd9\` FOREIGN KEY (\`utility_id\`) REFERENCES \`utilities\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_plants\` ADD CONSTRAINT \`FK_11e35c1ddc49a96f38c9d5a16ea\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`photos\` MODIFY \`entity_type\` enum ('asset', 'utility', 'plant') NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO \`plants\` (\`id\`, \`type\`, \`code\`, \`name\`, \`asset_id_fk\`, \`notes\`, \`status\`, \`create_date\`, \`update_date\`, \`created_by_user_id\`, \`updated_by_user_id\`, \`deleted\`) SELECT \`id\`, 'THERMAL', CONCAT('TERM-', \`id\`), \`name\`, \`asset_id_fk\`, \`notes\`, 'ACTIVE', \`create_date\`, \`update_date\`, \`created_by_user_id\`, \`updated_by_user_id\`, 0 FROM \`thermal_plants\` WHERE \`deleted\` = 0`,
    );
    await queryRunner.query(
      `INSERT INTO \`plant_thermal\` (\`plant_id\`, \`power_kw\`, \`generators_description\`, \`vvf_certification\`, \`vvf_exempt\`, \`inail_certification\`, \`inail_exempt\`, \`served_area_sqm\`, \`water_room\`, \`outdoor_units\`, \`indoor_units\`, \`fan_coils\`, \`air_handling_units\`, \`chillers_heat_pumps\`) SELECT \`id\`, \`power_kw\`, \`generators_description\`, \`vvf_certification\`, \`vvf_exempt\`, \`inail_certification\`, \`inail_exempt\`, \`served_area_sqm\`, \`water_room\`, \`outdoor_units\`, \`indoor_units\`, \`fan_coils\`, \`air_handling_units\`, \`chillers_heat_pumps\` FROM \`thermal_plants\` WHERE \`deleted\` = 0`,
    );
    await queryRunner.query(
      `INSERT INTO \`utility_plants\` (\`utility_id\`, \`plant_id\`) SELECT \`utility_id_fk\`, \`id\` FROM \`thermal_plants\` WHERE \`deleted\` = 0 AND \`utility_id_fk\` IS NOT NULL`,
    );
    await queryRunner.query(
      `DROP TABLE \`thermal_plants\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`thermal_plants\` (\`id\` int NOT NULL AUTO_INCREMENT, \`asset_id_fk\` int NOT NULL, \`utility_id_fk\` int NULL, \`name\` varchar(255) NOT NULL, \`power_kw\` decimal(10,2) NULL, \`generators_description\` varchar(255) NULL, \`vvf_certification\` varchar(255) NULL, \`vvf_exempt\` tinyint NOT NULL DEFAULT 0, \`inail_certification\` varchar(255) NULL, \`inail_exempt\` tinyint NOT NULL DEFAULT 0, \`served_area_sqm\` decimal(10,2) NULL, \`water_room\` tinyint NULL, \`outdoor_units\` int NULL, \`indoor_units\` int NULL, \`fan_coils\` int NULL, \`air_handling_units\` int NULL, \`chillers_heat_pumps\` int NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_d8d5d15e470003d25089337231\` (\`utility_id_fk\`, \`deleted\`), INDEX \`IDX_4cafc983fc317d66409b3c067d\` (\`asset_id_fk\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
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
    await queryRunner.query(
      `INSERT INTO \`thermal_plants\` (\`id\`, \`asset_id_fk\`, \`utility_id_fk\`, \`name\`, \`power_kw\`, \`generators_description\`, \`vvf_certification\`, \`vvf_exempt\`, \`inail_certification\`, \`inail_exempt\`, \`served_area_sqm\`, \`water_room\`, \`outdoor_units\`, \`indoor_units\`, \`fan_coils\`, \`air_handling_units\`, \`chillers_heat_pumps\`, \`notes\`, \`create_date\`, \`update_date\`, \`created_by_user_id\`, \`updated_by_user_id\`, \`deleted\`) SELECT p.\`id\`, p.\`asset_id_fk\`, (SELECT MIN(up.\`utility_id\`) FROM \`utility_plants\` up WHERE up.\`plant_id\` = p.\`id\`), p.\`name\`, t.\`power_kw\`, t.\`generators_description\`, t.\`vvf_certification\`, IFNULL(t.\`vvf_exempt\`, 0), t.\`inail_certification\`, IFNULL(t.\`inail_exempt\`, 0), t.\`served_area_sqm\`, t.\`water_room\`, t.\`outdoor_units\`, t.\`indoor_units\`, t.\`fan_coils\`, t.\`air_handling_units\`, t.\`chillers_heat_pumps\`, p.\`notes\`, p.\`create_date\`, p.\`update_date\`, p.\`created_by_user_id\`, p.\`updated_by_user_id\`, p.\`deleted\` FROM \`plants\` p LEFT JOIN \`plant_thermal\` t ON t.\`plant_id\` = p.\`id\` WHERE p.\`type\` = 'THERMAL' AND p.\`asset_id_fk\` IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`photos\` MODIFY \`entity_type\` enum ('asset', 'utility') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_plants\` DROP FOREIGN KEY \`FK_11e35c1ddc49a96f38c9d5a16ea\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_plants\` DROP FOREIGN KEY \`FK_26313a5b4f7d4c9ff6fdf965dd9\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` DROP FOREIGN KEY \`FK_683e611cc12e56647cbf9459542\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` DROP FOREIGN KEY \`FK_631e233bb1ab899d992868bd2af\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` DROP FOREIGN KEY \`FK_277174dffd55273b0b17207d9bf\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_inspections\` DROP FOREIGN KEY \`FK_2c20a49b7e90d591f416f9dace2\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_fire_equipment\` DROP FOREIGN KEY \`FK_0cbc2a4d31114def8a8fce9db54\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_elevator\` DROP FOREIGN KEY \`FK_9dcf2d08d863af7405d3282c80e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_thermal\` DROP FOREIGN KEY \`FK_e1b3952c04a940dee6407c359f3\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_11e35c1ddc49a96f38c9d5a16e\` ON \`utility_plants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_26313a5b4f7d4c9ff6fdf965dd\` ON \`utility_plants\``,
    );
    await queryRunner.query(
      `DROP TABLE \`utility_plants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_172755cf0a27e671fea1c7d00d\` ON \`plants\``,
    );
    await queryRunner.query(
      `DROP TABLE \`plants\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_30293b0e83f6b1704fefd3325a\` ON \`plant_inspections\``,
    );
    await queryRunner.query(
      `DROP TABLE \`plant_inspections\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_1bd07faf38bab12ca8c4b3f498\` ON \`plant_fire_equipment\``,
    );
    await queryRunner.query(
      `DROP TABLE \`plant_fire_equipment\``,
    );
    await queryRunner.query(
      `DROP TABLE \`plant_elevator\``,
    );
    await queryRunner.query(
      `DROP TABLE \`plant_thermal\``,
    );
  }
}
