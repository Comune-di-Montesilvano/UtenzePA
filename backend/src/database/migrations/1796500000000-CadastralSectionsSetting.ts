import { MigrationInterface, QueryRunner } from 'typeorm';

// Impostazione dell'ente: il catasto ha le sezioni? (default sì). Con no il
// campo «Sezione» si nasconde; i dati di asset_cadastral_units restano.
export class CadastralSectionsSetting1796500000000 implements MigrationInterface {
  name = 'CadastralSectionsSetting1796500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `app_settings` ADD `cadastral_sections` tinyint NOT NULL DEFAULT 1');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `app_settings` DROP COLUMN `cadastral_sections`');
  }
}
