import { MigrationInterface, QueryRunner } from 'typeorm';

// Impegni contabili veri (v1.47.0): numero della ragioneria anno/num/sub,
// fornitore, zero o più contratti (budget_commitment_contracts al posto di
// budget_commitments.contract_id_fk); note sul capitolo; righe di fattura con
// impegno automatico o scelto a mano; allegati su convenzioni e impegni.
// Il vecchio commitment_number (testo libero) finisce in testa alle note.
export class RealCommitments1795800000000 implements MigrationInterface {
  name = 'RealCommitments1795800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `budget_commitment_contracts` (`commitment_id` int NOT NULL, `contract_id` int NOT NULL, ' +
        'INDEX `IDX_871bf9d172bfcd9609d4266162` (`commitment_id`), INDEX `IDX_bbb924d6e82cea2c320d1f4f8b` (`contract_id`), PRIMARY KEY (`commitment_id`, `contract_id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `budget_commitment_contracts` ADD CONSTRAINT `FK_budget_commitment_contracts_commitment` ' +
        'FOREIGN KEY (`commitment_id`) REFERENCES `budget_commitments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await q.query(
      'ALTER TABLE `budget_commitment_contracts` ADD CONSTRAINT `FK_budget_commitment_contracts_contract` ' +
        'FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
    await q.query(
      'INSERT INTO `budget_commitment_contracts` (`commitment_id`, `contract_id`) ' +
        'SELECT `id`, `contract_id_fk` FROM `budget_commitments`',
    );
    await q.query(
      "UPDATE `budget_commitments` SET `notes` = CONCAT('Numero: ', `commitment_number`, IF(`notes` IS NULL OR `notes` = '', '', CONCAT('\\n', `notes`))), " +
        '`update_date` = `update_date` WHERE `commitment_number` IS NOT NULL AND `commitment_number` <> \'\'',
    );
    await q.query('ALTER TABLE `budget_commitments` DROP FOREIGN KEY `FK_budget_commitments_contract`');
    await q.query('DROP INDEX `IDX_budget_commitments_contract` ON `budget_commitments`');
    await q.query('ALTER TABLE `budget_commitments` DROP COLUMN `contract_id_fk`');
    await q.query('ALTER TABLE `budget_commitments` DROP COLUMN `commitment_number`');
    await q.query(
      'ALTER TABLE `budget_commitments` ADD `commitment_year` int NULL, ADD `commitment_num` int NULL, ' +
        'ADD `commitment_sub` int NULL, ADD `supplier_id_fk` int NULL',
    );
    await q.query(
      'CREATE INDEX `IDX_budget_commitments_number` ON `budget_commitments` (`commitment_year`, `commitment_num`, `commitment_sub`)',
    );
    await q.query(
      'ALTER TABLE `budget_commitments` ADD CONSTRAINT `FK_budget_commitments_supplier` ' +
        'FOREIGN KEY (`supplier_id_fk`) REFERENCES `third_parties`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('ALTER TABLE `budget_chapters` ADD `notes` text NULL');
    await q.query('ALTER TABLE `invoice_lines` ADD `commitment_auto` tinyint NOT NULL DEFAULT 1');
    // Le righe esistenti restano automatiche: gli impegni finora li assegnava l'import, non l'utente.
    await q.query(
      'ALTER TABLE `attachments` MODIFY `entity_type` ' +
        "enum('asset','plant','plant_inspection','utilizer_grant','contract','act','consip_agreement','budget_commitment') NOT NULL",
    );
  }

  // Ogni impegno torna su un solo contratto (il primo collegato); quelli senza
  // contratti non sono rappresentabili nel vecchio modello: righe di fattura
  // scollegate e impegni eliminati. Allegati dei nuovi tipi eliminati.
  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `attachments` WHERE `entity_type` IN ('consip_agreement','budget_commitment')");
    await q.query(
      'ALTER TABLE `attachments` MODIFY `entity_type` ' +
        "enum('asset','plant','plant_inspection','utilizer_grant','contract','act') NOT NULL",
    );
    await q.query('ALTER TABLE `invoice_lines` DROP COLUMN `commitment_auto`');
    await q.query('ALTER TABLE `budget_chapters` DROP COLUMN `notes`');
    await q.query('ALTER TABLE `budget_commitments` DROP FOREIGN KEY `FK_budget_commitments_supplier`');
    await q.query('DROP INDEX `IDX_budget_commitments_number` ON `budget_commitments`');
    await q.query(
      'ALTER TABLE `budget_commitments` ADD `contract_id_fk` int NULL, ADD `commitment_number` varchar(50) NULL',
    );
    await q.query(
      'UPDATE `budget_commitments` b JOIN (SELECT `commitment_id`, MIN(`contract_id`) AS `contract_id` ' +
        'FROM `budget_commitment_contracts` GROUP BY `commitment_id`) c ON c.`commitment_id` = b.`id` ' +
        'SET b.`contract_id_fk` = c.`contract_id`, b.`update_date` = b.`update_date`',
    );
    await q.query(
      "UPDATE `budget_commitments` SET `commitment_number` = CONCAT(`commitment_year`, '/', `commitment_num`, '/', COALESCE(`commitment_sub`, 1)), " +
        '`update_date` = `update_date` WHERE `commitment_num` IS NOT NULL',
    );
    // Il testo libero portato nelle note dall'up torna nella colonna e il
    // prefisso sparisce: un nuovo up non lo ripete.
    await q.query(
      "UPDATE `budget_commitments` SET `commitment_number` = SUBSTRING_INDEX(SUBSTRING(`notes`, 9), '\n', 1), " +
        "`notes` = NULLIF(IF(LOCATE('\n', `notes`) > 0, SUBSTRING(`notes`, LOCATE('\n', `notes`) + 1), ''), ''), " +
        "`update_date` = `update_date` WHERE `notes` LIKE 'Numero: %'",
    );
    await q.query(
      'UPDATE `invoice_lines` SET `commitment_id_fk` = NULL WHERE `commitment_id_fk` IN ' +
        '(SELECT `id` FROM `budget_commitments` WHERE `contract_id_fk` IS NULL)',
    );
    await q.query('DELETE FROM `budget_commitments` WHERE `contract_id_fk` IS NULL');
    await q.query('ALTER TABLE `budget_commitments` MODIFY `contract_id_fk` int NOT NULL');
    await q.query(
      'ALTER TABLE `budget_commitments` DROP COLUMN `commitment_year`, DROP COLUMN `commitment_num`, ' +
        'DROP COLUMN `commitment_sub`, DROP COLUMN `supplier_id_fk`',
    );
    await q.query(
      'CREATE INDEX `IDX_budget_commitments_contract` ON `budget_commitments` (`contract_id_fk`, `deleted`)',
    );
    await q.query(
      'ALTER TABLE `budget_commitments` ADD CONSTRAINT `FK_budget_commitments_contract` ' +
        'FOREIGN KEY (`contract_id_fk`) REFERENCES `contracts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await q.query('DROP TABLE `budget_commitment_contracts`');
  }
}
