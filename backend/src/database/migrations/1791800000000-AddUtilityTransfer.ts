import { MigrationInterface, QueryRunner } from 'typeorm';

// Voltura dell'utenza (roadmap voce 12): a chi è intestata e da quando.
// Sostituisce, con costs_borne_by (rimossa dopo), il "costi a carico di"
// scritto a mano: lo stato si calcola dai contratti immobiliari.
export class AddUtilityTransfer1791800000000 implements MigrationInterface {
  name = 'AddUtilityTransfer1791800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `transferred_to_third_party_id` int NULL');
    await q.query('ALTER TABLE `utilities` ADD `transferred_on` date NULL');
    await q.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_utilities_transferred_to` FOREIGN KEY (`transferred_to_third_party_id`) REFERENCES `third_parties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP FOREIGN KEY `FK_utilities_transferred_to`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transferred_on`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `transferred_to_third_party_id`');
  }
}
