import { MigrationInterface, QueryRunner } from 'typeorm';

// Una sola coppia destinazione + natura tra i capitoli non cancellati (v1.62.0):
// indice unico funzionale (NULL per i cancellati e per i capitoli senza
// destinazione, quindi non conflittuali). Il controllo del service dà il
// messaggio; l'indice chiude la corsa tra due salvataggi. Gestito a mano:
// `@Index(..., { synchronize: false })` sull'entity.
export class ChapterDestinationUnique1797000000000 implements MigrationInterface {
  name = 'ChapterDestinationUnique1797000000000';

  public async up(q: QueryRunner): Promise<void> {
    const dup = await q.query(
      "SELECT spending_destination_id, COALESCE(hard_type, '') AS nature, COUNT(*) AS n FROM budget_chapters WHERE deleted = 0 AND spending_destination_id IS NOT NULL GROUP BY spending_destination_id, COALESCE(hard_type, '') HAVING n > 1",
    );
    if (dup.length) {
      throw new Error(
        `Capitoli con la stessa destinazione e natura: ${JSON.stringify(dup)}. Correggere prima di aggiornare.`,
      );
    }
    await q.query(
      "CREATE UNIQUE INDEX `UQ_budget_chapters_destination` ON `budget_chapters` ((CASE WHEN `deleted` = 0 AND `spending_destination_id` IS NOT NULL THEN CONCAT(`spending_destination_id`, '|', COALESCE(`hard_type`, '')) END))",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX `UQ_budget_chapters_destination` ON `budget_chapters`');
  }
}
