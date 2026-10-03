import { MigrationInterface, QueryRunner } from 'typeorm';

// Categoria d'uso del gas (delibera 229/2012/R/gas: C1 riscaldamento, C2
// cottura e/o acqua calda, C3 entrambi, C4 condizionamento, C5
// condizionamento + riscaldamento, T1 uso tecnologico, T2 tecnologico +
// riscaldamento), distinta dalla tipologia di cliente TIVG. Solo utenze gas.
export class GasUseCategory1791700000000 implements MigrationInterface {
  name = 'GasUseCategory1791700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `utilities` ADD `gas_use_category` enum ('C1', 'C2', 'C3', 'C4', 'C5', 'T1', 'T2') NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` DROP COLUMN `gas_use_category`');
  }
}
