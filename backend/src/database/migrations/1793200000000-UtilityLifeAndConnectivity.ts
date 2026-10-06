import { MigrationInterface, QueryRunner } from 'typeorm';

// Date di attivazione/cessazione dell'utenza (vita propria rispetto al
// contratto di fornitura) e dati tecnici della connettività. Solo colonne
// nuove facoltative: nessun dato da spostare.
export class UtilityLifeAndConnectivity1793200000000 implements MigrationInterface {
  name = 'UtilityLifeAndConnectivity1793200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `activated_on` date NULL');
    await q.query('ALTER TABLE `utilities` ADD `ceased_on` date NULL');
    await q.query(
      "ALTER TABLE `utilities` ADD `internet_technology` enum ('FTTH', 'FTTC', 'FWA', 'ADSL', 'VDSL', 'COPPER', 'MOBILE', 'SATELLITE', 'OTHER') NULL",
    );
    await q.query('ALTER TABLE `utilities` ADD `download_mbps` decimal(10,2) NULL');
    await q.query('ALTER TABLE `utilities` ADD `upload_mbps` decimal(10,2) NULL');
    await q.query('ALTER TABLE `utilities` ADD `guaranteed_mbps` decimal(10,2) NULL');
    await q.query('ALTER TABLE `utilities` ADD `modem_included` tinyint NULL');
    await q.query('ALTER TABLE `utilities` ADD `static_ip` tinyint NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `static_ip`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `modem_included`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `guaranteed_mbps`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `upload_mbps`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `download_mbps`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `internet_technology`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `ceased_on`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `activated_on`');
  }
}
