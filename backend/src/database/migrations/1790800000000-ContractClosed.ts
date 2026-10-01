import { MigrationInterface, QueryRunner } from 'typeorm';

// Contratto chiuso/scaduto esplicito: mai "corrente", qualunque siano le
// date. Necessario per lo storico ordini CONSIP senza date di fornitura.
export class ContractClosed1790800000000 implements MigrationInterface {
  name = 'ContractClosed1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contracts\` ADD \`closed\` tinyint NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`contracts\` DROP COLUMN \`closed\``);
  }
}
