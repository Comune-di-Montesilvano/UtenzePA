import { MigrationInterface, QueryRunner } from 'typeorm';

// Tipologia del contratto di fornitura al posto del flag cig_exempt:
// Ordinario / Escluso da CIG / A titolo gratuito (alternative tra loro).
// I contratti esclusi da CIG restano tali; quelli gratuiti si segnano dalla UI.
export class ContractKind1793100000000 implements MigrationInterface {
  name = 'ContractKind1793100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `contracts` ADD `contract_kind` enum ('STANDARD', 'CIG_EXEMPT', 'FREE') NOT NULL DEFAULT 'STANDARD'",
    );
    await q.query("UPDATE `contracts` SET `contract_kind` = 'CIG_EXEMPT' WHERE `cig_exempt` = 1");
    await q.query('ALTER TABLE `contracts` DROP COLUMN `cig_exempt`');
  }

  public async down(q: QueryRunner): Promise<void> {
    // A titolo gratuito torna "escluso da CIG" (il vecchio modello non lo distingueva).
    await q.query("ALTER TABLE `contracts` ADD `cig_exempt` tinyint NOT NULL DEFAULT '0'");
    await q.query("UPDATE `contracts` SET `cig_exempt` = 1 WHERE `contract_kind` <> 'STANDARD'");
    await q.query('ALTER TABLE `contracts` DROP COLUMN `contract_kind`');
  }
}
