import { MigrationInterface, QueryRunner } from 'typeorm';

// Scritta a mano invece che con `migration:generate`: il DataSource ha drift
// di schema preesistente (indici/FK non allineati all'entity attuale) non
// legato a questa modifica — generare avrebbe prodotto decine di query
// rumorose e non correlate. Unica modifica reale: colonna `icon` nullable su
// `asset_aggregators` (nome ligature Material Icons, vedi entity).
export class AddIconToAssetAggregator1788254175808 implements MigrationInterface {
  name = 'AddIconToAssetAggregator1788254175808';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `asset_aggregators` ADD `icon` varchar(50) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `asset_aggregators` DROP COLUMN `icon`');
  }
}
