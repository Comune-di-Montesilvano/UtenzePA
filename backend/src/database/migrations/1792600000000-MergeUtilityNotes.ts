import { MigrationInterface, QueryRunner } from 'typeorm';

// Note dell'utenza unite in `notes` (roadmap voce 18 parte 2): il contenuto di
// additional_notes e specifications va spostato prima (intervento sui dati).
export class MergeUtilityNotes1792600000000 implements MigrationInterface {
  name = 'MergeUtilityNotes1792600000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ left }]: { left: number | string }[] = await q.query(
      "SELECT COUNT(*) AS `left` FROM `utilities` WHERE NULLIF(TRIM(`additional_notes`), '') IS NOT NULL OR NULLIF(TRIM(`specifications`), '') IS NOT NULL",
    );
    if (Number(left) > 0) {
      throw new Error(
        `utilities: ${Number(left)} utenze con note aggiuntive o specifiche. Spostarle in notes prima di rilanciare la migration.`,
      );
    }
    await q.query('ALTER TABLE `utilities` DROP COLUMN `additional_notes`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `specifications`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `specifications` text NULL');
    await q.query('ALTER TABLE `utilities` ADD `additional_notes` text NULL');
  }
}
