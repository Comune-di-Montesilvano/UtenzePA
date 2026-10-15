import { MigrationInterface, QueryRunner } from 'typeorm';

// Dati tecnici dal fatturato del fornitore di energia elettrica: codice
// impianto sull'utenza, consumi per fascia e penale per energia reattiva
// sui consumi di periodo. Solo colonne nullable, nessun dato da spostare.
export class ElectricTechnicalData1794500000000 implements MigrationInterface {
  name = 'ElectricTechnicalData1794500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `supplier_plant_code` varchar(50) NULL');
    await q.query(
      'ALTER TABLE `utility_consumptions` ADD `consumption_f0` decimal(14,3) NULL, ADD `consumption_f1` decimal(14,3) NULL, ADD `consumption_f2` decimal(14,3) NULL, ADD `consumption_f3` decimal(14,3) NULL, ADD `reactive_penalty` tinyint NULL',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `utility_consumptions` DROP COLUMN `reactive_penalty`, DROP COLUMN `consumption_f3`, DROP COLUMN `consumption_f2`, DROP COLUMN `consumption_f1`, DROP COLUMN `consumption_f0`',
    );
    await q.query('ALTER TABLE `utilities` DROP COLUMN `supplier_plant_code`');
  }
}
