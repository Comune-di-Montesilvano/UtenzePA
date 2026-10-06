import { MigrationInterface, QueryRunner } from 'typeorm';

// Assestato e stanziamento iniziale per capitolo/anno sulla riga della spesa
// storica; la spesa ragioneria diventa facoltativa (almeno un importo, nel service).
export class ChapterBudget1793300000000 implements MigrationInterface {
  name = 'ChapterBudget1793300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `budget_chapter_spending` ADD `initial_budget` decimal(14,2) NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` ADD `adjusted_budget` decimal(14,2) NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` MODIFY `amount` decimal(14,2) NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: number | string }[] = await q.query(
      'SELECT COUNT(*) AS n FROM `budget_chapter_spending` WHERE `amount` IS NULL',
    );
    if (Number(n) > 0) {
      throw new Error(
        `budget_chapter_spending: ${Number(n)} righe senza spesa ragioneria. Completarle o eliminarle prima del down.`,
      );
    }
    await q.query('ALTER TABLE `budget_chapter_spending` MODIFY `amount` decimal(14,2) NOT NULL');
    await q.query('ALTER TABLE `budget_chapter_spending` DROP COLUMN `adjusted_budget`');
    await q.query('ALTER TABLE `budget_chapter_spending` DROP COLUMN `initial_budget`');
  }
}
