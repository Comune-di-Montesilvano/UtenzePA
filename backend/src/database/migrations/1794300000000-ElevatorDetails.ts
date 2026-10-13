import { MigrationInterface, QueryRunner } from 'typeorm';

// Ascensori: capienza, accessi, corsa, norma tecnica e SIM di emergenza dalle
// schede dell'anagrafe comunale ascensori (prima finivano nelle note).
export class ElevatorDetails1794300000000 implements MigrationInterface {
  name = 'ElevatorDetails1794300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `plant_elevator` ADD `capacity_persons` int NULL, ADD `entrances` int NULL, ADD `travel_m` decimal(6,2) NULL, ADD `technical_standard` varchar(100) NULL, ADD `emergency_sim` tinyint NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `plant_elevator` DROP COLUMN `emergency_sim`, DROP COLUMN `technical_standard`, DROP COLUMN `travel_m`, DROP COLUMN `entrances`, DROP COLUMN `capacity_persons`',
    );
  }
}
