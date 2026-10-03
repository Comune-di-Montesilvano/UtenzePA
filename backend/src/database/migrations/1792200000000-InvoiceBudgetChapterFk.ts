import { MigrationInterface, QueryRunner } from 'typeorm';

// invoice_budget_chapter senza FK (drift del DB di sviluppo): le righe restavano
// orfane quando le fatture cambiavano id. Aggiunge le FK di InitialSchema solo
// se mancano; con righe orfane si ferma prima di ogni DDL (commit implicito).
const FKS = [
  {
    name: 'FK_891310b3d845fe3f7d00346e65b',
    sql: 'ALTER TABLE `invoice_budget_chapter` ADD CONSTRAINT `FK_891310b3d845fe3f7d00346e65b` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  },
  {
    name: 'FK_9cffdf1bcf101d43271ac87c53d',
    sql: 'ALTER TABLE `invoice_budget_chapter` ADD CONSTRAINT `FK_9cffdf1bcf101d43271ac87c53d` FOREIGN KEY (`budget_chapter_id`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
  },
];

export class InvoiceBudgetChapterFk1792200000000 implements MigrationInterface {
  name = 'InvoiceBudgetChapterFk1792200000000';

  public async up(q: QueryRunner): Promise<void> {
    const existing: { name: string }[] = await q.query(
      "SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_budget_chapter' AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
    );
    const missing = FKS.filter((fk) => !existing.some((e) => e.name === fk.name));
    if (!missing.length) return;
    const [{ orphans }]: { orphans: number | string }[] = await q.query(
      'SELECT COUNT(*) AS orphans FROM `invoice_budget_chapter` ibc LEFT JOIN `invoices` i ON i.id = ibc.invoice_id LEFT JOIN `budget_chapters` b ON b.id = ibc.budget_chapter_id WHERE i.id IS NULL OR b.id IS NULL',
    );
    if (Number(orphans) > 0) {
      throw new Error(
        `invoice_budget_chapter: ${Number(orphans)} righe orfane (fattura o capitolo inesistente). Cancellarle prima di rilanciare la migration.`,
      );
    }
    for (const fk of missing) await q.query(fk.sql);
  }

  // Nessun down: le FK potevano esistere già prima, toglierle lascerebbe lo
  // schema peggiore di prima.
  public async down(): Promise<void> {}
}
