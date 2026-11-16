import { MigrationInterface, QueryRunner } from 'typeorm';

// Capitolo dell'utenza facoltativo anche sulle installazioni nuove: la InitialSchema
// creava `utilities.budget_chapter_code_fk` NOT NULL (le installazioni esistenti l'hanno
// già NULL dal vecchio SYNCHRONIZE), quindi su un DB nuovo un'utenza senza capitolo
// (contratto a titolo gratuito, capitolo da assegnare) non si salvava. Trovato dai test
// d'integrazione. Idempotente: sulle colonne già NULL non cambia nulla.
export class UtilityChapterNullable1796800000000 implements MigrationInterface {
  name = 'UtilityChapterNullable1796800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` MODIFY `budget_chapter_code_fk` int NULL');
  }

  // Nessun ritorno a NOT NULL: era il difetto, e fallirebbe con utenze senza capitolo.
  public async down(): Promise<void> {}
}
