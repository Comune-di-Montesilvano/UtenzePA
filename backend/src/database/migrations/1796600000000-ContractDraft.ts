import { MigrationInterface, QueryRunner } from 'typeorm';

// Ordine in bozza: contratto di fornitura non ancora emesso. Vale solo per
// il calcolo del fabbisogno della convenzione (apis/contracts/contract-draft.ts).
export class ContractDraft1796600000000 implements MigrationInterface {
  name = 'ContractDraft1796600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` ADD `draft` tinyint NOT NULL DEFAULT 0');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` DROP COLUMN `draft`');
  }
}
