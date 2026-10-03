import { QueryRunner } from 'typeorm';
import { GasUseCategory1791700000000 } from './migrations/1791700000000-GasUseCategory';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
function runner() {
  const sql: string[] = [];
  const q = { query: jest.fn(async (s: string) => (sql.push(s), [])) } as unknown as QueryRunner;
  return { q, sql };
}

describe('Migration GasUseCategory1791700000000', () => {
  const migration = new GasUseCategory1791700000000();

  it('aggiunge la colonna enum nullable con le 7 categorie', async () => {
    const { q, sql } = runner();
    await migration.up(q);
    expect(sql).toEqual([
      "ALTER TABLE `utilities` ADD `gas_use_category` enum ('C1', 'C2', 'C3', 'C4', 'C5', 'T1', 'T2') NULL",
    ]);
  });

  it('down toglie la colonna', async () => {
    const { q, sql } = runner();
    await migration.down(q);
    expect(sql).toEqual(['ALTER TABLE `utilities` DROP COLUMN `gas_use_category`']);
  });
});
