import { MigrationInterface, QueryRunner } from 'typeorm';

// Capitolo di spesa → tipi utenza in tabella (N-N), al posto dell'elenco fisso
// supply_type, che non aveva la Connettività. Ogni tipo fornitura passa ai tipi
// utenza della stessa natura; Utenze Sprar (multi-utenza) = nessun tipo = tutti.
export class BudgetChapterUtilityTypes1793000000000 implements MigrationInterface {
  name = 'BudgetChapterUtilityTypes1793000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `budget_chapter_utility_types` (`budget_chapter_id` int NOT NULL, `utility_type_id` int NOT NULL, INDEX `IDX_04b9bfce08bdc6b2eb70e8a27b` (`budget_chapter_id`), INDEX `IDX_61cb4ff56037a9fa026d7718f3` (`utility_type_id`), PRIMARY KEY (`budget_chapter_id`, `utility_type_id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `budget_chapter_utility_types` ADD CONSTRAINT `FK_04b9bfce08bdc6b2eb70e8a27b1` FOREIGN KEY (`budget_chapter_id`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await q.query(
      'ALTER TABLE `budget_chapter_utility_types` ADD CONSTRAINT `FK_61cb4ff56037a9fa026d7718f38` FOREIGN KEY (`utility_type_id`) REFERENCES `utility_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await q.query(
      "INSERT INTO `budget_chapter_utility_types` (`budget_chapter_id`, `utility_type_id`) SELECT bc.`id`, ut.`id` FROM `budget_chapters` bc JOIN `utility_types` ut ON ut.`deleted` = 0 AND ut.`hard_type` = CASE bc.`supply_type` WHEN 'ELECTRICITY' THEN 'LIGHT' WHEN 'WATER' THEN 'WATER' WHEN 'GAS_SUPPLY_ONLY' THEN 'GAS' WHEN 'THERMAL_MANAGEMENT' THEN 'GAS' END",
    );
    await q.query('ALTER TABLE `budget_chapters` DROP COLUMN `supply_type`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `budget_chapters` ADD `supply_type` enum ('ELECTRICITY', 'THERMAL_MANAGEMENT', 'GAS_SUPPLY_ONLY', 'WATER', 'SPRAR_UTILITIES') NULL",
    );
    // Un solo tipo fornitura: quello del primo tipo utenza; nessuno o Connettività = Sprar.
    await q.query(
      "UPDATE `budget_chapters` bc SET bc.`supply_type` = COALESCE((SELECT CASE ut.`hard_type` WHEN 'LIGHT' THEN 'ELECTRICITY' WHEN 'WATER' THEN 'WATER' WHEN 'GAS' THEN 'GAS_SUPPLY_ONLY' END FROM `budget_chapter_utility_types` x JOIN `utility_types` ut ON ut.`id` = x.`utility_type_id` WHERE x.`budget_chapter_id` = bc.`id` AND ut.`hard_type` <> 'INTERNET' ORDER BY ut.`id` LIMIT 1), 'SPRAR_UTILITIES')",
    );
    await q.query('ALTER TABLE `budget_chapter_utility_types` DROP FOREIGN KEY `FK_61cb4ff56037a9fa026d7718f38`');
    await q.query('ALTER TABLE `budget_chapter_utility_types` DROP FOREIGN KEY `FK_04b9bfce08bdc6b2eb70e8a27b1`');
    await q.query('DROP INDEX `IDX_61cb4ff56037a9fa026d7718f3` ON `budget_chapter_utility_types`');
    await q.query('DROP INDEX `IDX_04b9bfce08bdc6b2eb70e8a27b` ON `budget_chapter_utility_types`');
    await q.query('DROP TABLE `budget_chapter_utility_types`');
  }
}
