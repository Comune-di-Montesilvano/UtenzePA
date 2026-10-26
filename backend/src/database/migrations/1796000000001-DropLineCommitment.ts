import { MigrationInterface, QueryRunner } from 'typeorm';

// Via le colonne d'impegno dalle righe di fattura (v1.49.0): l'impegno vive
// solo nelle quote della fattura (invoice_commitment_shares, migration precedente).
export class DropLineCommitment1796000000001 implements MigrationInterface {
  name = 'DropLineCommitment1796000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `invoice_lines` DROP FOREIGN KEY `FK_invoice_lines_commitment`');
    await q.query('DROP INDEX `FK_invoice_lines_commitment` ON `invoice_lines`');
    await q.query(
      'ALTER TABLE `invoice_lines` DROP COLUMN `commitment_id_fk`, DROP COLUMN `commitment_auto`, DROP COLUMN `commitment_fiscal_year`',
    );
  }

  // Ricrea le colonne (quote ACCOUNTING = commitment_auto 1, come le AUTO); impegno e annualità tornano sulle righe solo se la fattura
  // ha una quota sola (automatica = source diverso da MANUAL). Con più quote le
  // righe restano senza impegno e automatiche: il vecchio ricalcolo le riassegna.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `invoice_lines` ADD `commitment_id_fk` int NULL, ADD `commitment_auto` tinyint NOT NULL DEFAULT 1, ' +
        'ADD `commitment_fiscal_year` int NULL',
    );
    await q.query('CREATE INDEX `FK_invoice_lines_commitment` ON `invoice_lines` (`commitment_id_fk`)');
    await q.query(
      'ALTER TABLE `invoice_lines` ADD CONSTRAINT `FK_invoice_lines_commitment` ' +
        'FOREIGN KEY (`commitment_id_fk`) REFERENCES `budget_commitments`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query(
      'UPDATE `invoice_lines` il JOIN (SELECT `invoice_id_fk`, MIN(`commitment_id_fk`) AS `commitment_id`, ' +
        'MIN(`fiscal_year`) AS `fiscal_year`, MIN(`source`) AS `source` FROM `invoice_commitment_shares` ' +
        'GROUP BY `invoice_id_fk` HAVING COUNT(*) = 1) sh ON sh.`invoice_id_fk` = il.`invoice_id_fk` ' +
        "SET il.`commitment_id_fk` = sh.`commitment_id`, il.`commitment_fiscal_year` = sh.`fiscal_year`, il.`commitment_auto` = (sh.`source` <> 'MANUAL')",
    );
  }
}
