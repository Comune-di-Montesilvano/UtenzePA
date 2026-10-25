import { MigrationInterface, QueryRunner } from 'typeorm';

// Impegni pluriennali (v1.48.0): esercizio e importo passano dall'impegno alle
// sue annualità (budget_commitment_years, una per anno di competenza). Ogni
// impegno esistente diventa una sola annualità. La riga di fattura sa su quale
// annualità pesa (invoice_lines.commitment_fiscal_year, scritta dal ricalcolo):
// per le righe già assegnate è l'esercizio dell'impegno.
export class CommitmentYears1795900000000 implements MigrationInterface {
  name = 'CommitmentYears1795900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `budget_commitment_years` (`id` int NOT NULL AUTO_INCREMENT, `commitment_id` int NOT NULL, ' +
        '`fiscal_year` int NOT NULL, `amount` decimal(14,2) NULL, ' +
        'UNIQUE INDEX `IDX_budget_commitment_years_year` (`commitment_id`, `fiscal_year`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `budget_commitment_years` ADD CONSTRAINT `FK_budget_commitment_years_commitment` ' +
        'FOREIGN KEY (`commitment_id`) REFERENCES `budget_commitments`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'INSERT INTO `budget_commitment_years` (`commitment_id`, `fiscal_year`, `amount`) ' +
        'SELECT `id`, `fiscal_year`, `amount` FROM `budget_commitments`',
    );
    await q.query('ALTER TABLE `invoice_lines` ADD `commitment_fiscal_year` int NULL');
    await q.query(
      'UPDATE `invoice_lines` il JOIN `budget_commitments` bc ON bc.id = il.commitment_id_fk ' +
        'SET il.commitment_fiscal_year = bc.fiscal_year',
    );
    await q.query('ALTER TABLE `budget_commitments` DROP COLUMN `fiscal_year`');
    await q.query('ALTER TABLE `budget_commitments` DROP COLUMN `amount`');
  }

  // Un pluriennale torna annuale: esercizio = prima annualità, importo = somma
  // (null se un'annualità non ha importo).
  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `budget_commitments` ADD `fiscal_year` int NULL, ADD `amount` decimal(14,2) NULL');
    await q.query(
      'UPDATE `budget_commitments` bc JOIN (SELECT commitment_id, MIN(fiscal_year) AS y, ' +
        'IF(SUM(amount IS NULL) > 0, NULL, SUM(amount)) AS a FROM `budget_commitment_years` GROUP BY commitment_id) t ' +
        'ON t.commitment_id = bc.id SET bc.fiscal_year = t.y, bc.amount = t.a, bc.update_date = bc.update_date',
    );
    await q.query(
      'UPDATE `budget_commitments` SET `fiscal_year` = YEAR(`create_date`), `update_date` = `update_date` WHERE `fiscal_year` IS NULL',
    );
    await q.query('ALTER TABLE `budget_commitments` MODIFY `fiscal_year` int NOT NULL');
    await q.query('ALTER TABLE `invoice_lines` DROP COLUMN `commitment_fiscal_year`');
    await q.query('ALTER TABLE `budget_commitment_years` DROP FOREIGN KEY `FK_budget_commitment_years_commitment`');
    await q.query('DROP TABLE `budget_commitment_years`');
  }
}
