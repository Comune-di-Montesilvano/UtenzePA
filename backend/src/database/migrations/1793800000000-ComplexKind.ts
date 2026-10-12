import { MigrationInterface, QueryRunner } from 'typeorm';

// Tipo di raggruppamento del complesso: fisico (un pin in mappa) o
// amministrativo (edifici distanti, es. istituto comprensivo: mai in mappa).
// I complessi esistenti restano fisici.
export class ComplexKind1793800000000 implements MigrationInterface {
  name = 'ComplexKind1793800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `complexes` ADD `kind` enum ('PHYSICAL', 'ADMINISTRATIVE') NOT NULL DEFAULT 'PHYSICAL'",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `complexes` DROP COLUMN `kind`');
  }
}
