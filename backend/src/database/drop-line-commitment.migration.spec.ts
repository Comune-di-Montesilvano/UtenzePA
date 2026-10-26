import { QueryRunner } from 'typeorm';
import { DropLineCommitment1796000000001 } from './migrations/1796000000001-DropLineCommitment';

function fakeRunner() {
  const sql: string[] = [];
  const runner = {
    query: jest.fn(async (q: string) => {
      sql.push(q);
      return [];
    }),
  } as unknown as QueryRunner;
  return { runner, sql };
}

const indexOf = (sql: string[], re: RegExp) => sql.findIndex((q) => re.test(q));

describe('DropLineCommitment migration', () => {
  it('up toglie FK, indice e le tre colonne delle righe', async () => {
    const { runner, sql } = fakeRunner();
    await new DropLineCommitment1796000000001().up(runner);
    const fk = indexOf(sql, /DROP FOREIGN KEY `FK_invoice_lines_commitment`/);
    const idx = indexOf(sql, /DROP INDEX `FK_invoice_lines_commitment`/);
    const cols = indexOf(sql, /DROP COLUMN `commitment_id_fk`.*DROP COLUMN `commitment_auto`.*DROP COLUMN `commitment_fiscal_year`/);
    expect(fk).toBe(0);
    expect(idx).toBeGreaterThan(fk);
    expect(cols).toBeGreaterThan(idx);
  });

  it('down ricrea colonne, indice e FK, poi riempie solo dalle fatture con una quota sola', async () => {
    const { runner, sql } = fakeRunner();
    await new DropLineCommitment1796000000001().down(runner);
    const add = indexOf(sql, /ADD `commitment_id_fk` int NULL.*ADD `commitment_auto` tinyint NOT NULL DEFAULT 1.*ADD `commitment_fiscal_year` int NULL/);
    const idx = indexOf(sql, /CREATE INDEX `FK_invoice_lines_commitment`/);
    const fk = indexOf(sql, /ADD CONSTRAINT `FK_invoice_lines_commitment`/);
    const fill = indexOf(sql, /^UPDATE `invoice_lines`/);
    expect(add).toBe(0);
    expect(idx).toBeGreaterThan(add);
    expect(fk).toBeGreaterThan(idx);
    expect(fill).toBeGreaterThan(fk);
    expect(sql[fill]).toMatch(/GROUP BY `invoice_id_fk` HAVING COUNT\(\*\) = 1/);
    expect(sql[fill]).toMatch(/il\.`commitment_auto` = \(sh\.`source` <> 'MANUAL'\)/);
    expect(sql[fill]).toMatch(/il\.`commitment_fiscal_year` = sh\.`fiscal_year`/);
  });
});
