import { MigrationInterface, QueryRunner } from 'typeorm';

// Immobili e dati MEF (voce 2 roadmap, fase 2): il catasto passa dalle colonne
// dell'immobile alla tabella asset_cadastral_units (N unità per immobile, una
// per ogni immobile che aveva foglio e particella); nuove colonne MEF su assets
// e tipologia/finalità MEF sulle funzioni.
export class AssetCadastralUnits1793700000000 implements MigrationInterface {
  name = 'AssetCadastralUnits1793700000000';

  public async up(q: QueryRunner): Promise<void> {
    // Un'unità richiede foglio e particella: con uno solo dei due il dato
    // andrebbe perso, quindi si corregge prima dalla UI.
    const [{ n }] = await q.query(
      "SELECT COUNT(*) AS n FROM `assets` WHERE ((`sheet` IS NULL OR TRIM(`sheet`) = '') <> (`parcel` IS NULL OR TRIM(`parcel`) = ''))",
    );
    if (Number(n) > 0) {
      throw new Error(
        `${n} immobili con foglio senza particella o viceversa: completarli prima della migration`,
      );
    }
    // Sub, categoria o rendita senza foglio e particella non diventano un'unità
    // e andrebbero persi: rendita 0 tollerata (valore vuoto di fatto).
    const [{ n: orphan }] = await q.query(
      "SELECT COUNT(*) AS n FROM `assets` WHERE (`sheet` IS NULL OR TRIM(`sheet`) = '') AND (`parcel` IS NULL OR TRIM(`parcel`) = '') AND ((`subordinate` IS NOT NULL AND TRIM(`subordinate`) <> '') OR (`category` IS NOT NULL AND TRIM(`category`) <> '') OR (`cadastral_value` IS NOT NULL AND `cadastral_value` <> 0))",
    );
    if (Number(orphan) > 0) {
      throw new Error(
        `${orphan} immobili con subalterno, categoria o rendita ma senza foglio e particella: completarli o svuotarli prima della migration`,
      );
    }

    await q.query(
      'CREATE TABLE `asset_cadastral_units` (`id` int NOT NULL AUTO_INCREMENT, `asset_id` int NOT NULL, `section` varchar(5) NULL, `sheet` varchar(50) NOT NULL, `parcel` varchar(50) NOT NULL, `subordinate` varchar(50) NULL, `category` varchar(100) NULL, `cadastral_income` decimal(15,2) NULL, INDEX `IDX_a31859ca5b018442d8540708c0` (`sheet`, `parcel`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `asset_cadastral_units` ADD CONSTRAINT `FK_593638b7f3f6edd170645c3c223` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      "INSERT INTO `asset_cadastral_units` (`asset_id`, `section`, `sheet`, `parcel`, `subordinate`, `category`, `cadastral_income`) SELECT `id`, NULL, TRIM(`sheet`), TRIM(`parcel`), NULLIF(TRIM(`subordinate`), ''), NULLIF(TRIM(`category`), ''), `cadastral_value` FROM `assets` WHERE `sheet` IS NOT NULL AND TRIM(`sheet`) <> '' AND `parcel` IS NOT NULL AND TRIM(`parcel`) <> '' ORDER BY `id`",
    );

    await q.query('ALTER TABLE `assets` DROP COLUMN `sheet`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `parcel`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `subordinate`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `cadastral_value`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `category`');
    await q.query('ALTER TABLE `assets` ADD `mef_id` int NULL');
    await q.query(
      'ALTER TABLE `assets` ADD UNIQUE INDEX `IDX_feab2f85ee1bf4af289d2e376f` (`mef_id`)',
    );
    await q.query(
      "ALTER TABLE `assets` ADD `legal_nature` enum ('AVAILABLE', 'UNAVAILABLE', 'STATE_PROPERTY', 'ND') NULL",
    );
    await q.query('ALTER TABLE `assets` ADD `reference_area_sqm` decimal(10,2) NULL');
    await q.query('ALTER TABLE `assets` ADD `appurtenance_area_sqm` decimal(10,2) NULL');
    await q.query('ALTER TABLE `assets` ADD `volume_m3` decimal(12,2) NULL');
    await q.query(
      "ALTER TABLE `assets` ADD `construction_period` enum ('BEFORE_1919', 'FROM_1919_TO_1945', 'FROM_1946_TO_1960', 'FROM_1961_TO_1970', 'FROM_1971_TO_1980', 'FROM_1981_TO_1990', 'FROM_1991_TO_2000', 'FROM_2001_TO_2010', 'AFTER_2010', 'ND') NULL",
    );
    await q.query(
      "ALTER TABLE `assets` ADD `heritage_constraint` enum ('NONE', 'CULTURAL_INTEREST', 'PUBLIC_INTEREST', 'LANDSCAPE_BY_LAW', 'CULTURAL_CHECK_PENDING', 'OVER_70_YEARS', 'INDIRECT_PROTECTION') NULL",
    );
    await q.query('ALTER TABLE `assets` ADD `federal_transfer` tinyint NULL');
    await q.query('ALTER TABLE `assets` ADD `confiscated` tinyint NULL');

    await q.query(
      "ALTER TABLE `asset_functions` ADD `mef_building_type` enum ('DWELLING', 'HOTEL', 'LIBRARY_MUSEUM', 'STORAGE_GARAGE', 'PRISON', 'ROAD_HOUSE', 'BARRACKS', 'HISTORIC_PALACE', 'WORSHIP', 'SCHOOL', 'PRODUCTIVE', 'LIGHTHOUSE', 'FORTIFICATION', 'SPORTS_FACILITY', 'LABORATORY', 'SHOP', 'WAREHOUSE', 'COVERED_MARKET', 'HOSPITAL', 'PARKING', 'BATHING_SPA', 'COLLECTIVE_RESIDENCE', 'THEATRE', 'OFFICE', 'ROOF_TERRACE', 'URBAN_AREA') NULL",
    );
    await q.query(
      "ALTER TABLE `asset_functions` ADD `mef_purpose` enum ('SERVICE_HOUSING', 'ADMINISTRATIVE', 'ARTS_CULTURE', 'COMMERCE_CATERING', 'WORSHIP', 'INSTITUTIONAL', 'EDUCATION', 'JUDICIAL', 'PRODUCTIVE', 'SPORTS_LEISURE', 'TOURISM', 'SOCIAL_HEALTH_NON_RES', 'SOCIAL_HEALTH_RES', 'PUBLIC_ORDER', 'PENITENTIARY', 'OTHER', 'STUDENT_HOUSING', 'RESEARCH', 'ACCESSORY', 'PARKING') NULL",
    );
  }

  // Torna alle colonne sull'immobile con la prima unità (id minore): le altre
  // unità e i dati MEF vanno persi.
  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `asset_functions` DROP COLUMN `mef_purpose`');
    await q.query('ALTER TABLE `asset_functions` DROP COLUMN `mef_building_type`');

    await q.query('ALTER TABLE `assets` ADD `category` varchar(100) NULL');
    await q.query('ALTER TABLE `assets` ADD `cadastral_value` decimal(15,2) NULL');
    await q.query('ALTER TABLE `assets` ADD `subordinate` varchar(50) NULL');
    await q.query('ALTER TABLE `assets` ADD `parcel` varchar(50) NULL');
    await q.query('ALTER TABLE `assets` ADD `sheet` varchar(50) NULL');
    await q.query(
      'UPDATE `assets` a JOIN (SELECT `asset_id`, MIN(`id`) AS `first_id` FROM `asset_cadastral_units` GROUP BY `asset_id`) f ON f.`asset_id` = a.`id` JOIN `asset_cadastral_units` u ON u.`id` = f.`first_id` SET a.`sheet` = u.`sheet`, a.`parcel` = u.`parcel`, a.`subordinate` = u.`subordinate`, a.`category` = u.`category`, a.`cadastral_value` = u.`cadastral_income`',
    );

    await q.query('ALTER TABLE `assets` DROP COLUMN `confiscated`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `federal_transfer`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `heritage_constraint`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `construction_period`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `volume_m3`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `appurtenance_area_sqm`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `reference_area_sqm`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `legal_nature`');
    await q.query('ALTER TABLE `assets` DROP INDEX `IDX_feab2f85ee1bf4af289d2e376f`');
    await q.query('ALTER TABLE `assets` DROP COLUMN `mef_id`');

    await q.query(
      'ALTER TABLE `asset_cadastral_units` DROP FOREIGN KEY `FK_593638b7f3f6edd170645c3c223`',
    );
    await q.query('DROP INDEX `IDX_a31859ca5b018442d8540708c0` ON `asset_cadastral_units`');
    await q.query('DROP TABLE `asset_cadastral_units`');
  }
}
