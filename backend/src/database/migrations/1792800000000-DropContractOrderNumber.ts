import { MigrationInterface, QueryRunner } from 'typeorm';

// Numero ordine unico (roadmap voce 18 parte 2): order_number duplicava
// consip_order. Il valore va spostato prima (intervento sui dati).
export class DropContractOrderNumber1792800000000 implements MigrationInterface {
  name = 'DropContractOrderNumber1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ left }]: { left: number | string }[] = await q.query(
      "SELECT COUNT(*) AS `left` FROM `contracts` WHERE NULLIF(TRIM(`order_number`), '') IS NOT NULL",
    );
    if (Number(left) > 0) {
      throw new Error(
        `contracts: ${Number(left)} contratti con order_number. Spostarlo in consip_order prima di rilanciare la migration.`,
      );
    }
    await q.query('ALTER TABLE `contracts` DROP COLUMN `order_number`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` ADD `order_number` text NULL');
  }
}
