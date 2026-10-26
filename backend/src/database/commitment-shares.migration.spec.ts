import { QueryRunner } from 'typeorm';
import { InvoiceCommitmentShares1796000000000 } from './migrations/1796000000000-InvoiceCommitmentShares';

function fakeRunner(conflicts: unknown[] = []) {
  const sql: string[] = [];
  const runner = {
    query: jest.fn(async (q: string) => {
      sql.push(q);
      return /^\s*SELECT/i.test(q) ? conflicts : [];
    }),
  } as unknown as QueryRunner;
  return { runner, sql };
}

const indexOf = (sql: string[], re: RegExp) => sql.findIndex((q) => re.test(q));

describe('InvoiceCommitmentShares migration', () => {
  it('up controlla i dati, crea la tabella e poi copia le righe assegnate', async () => {
    const { runner, sql } = fakeRunner();
    await new InvoiceCommitmentShares1796000000000().up(runner);
    const check = indexOf(sql, /^\s*SELECT/i);
    const create = indexOf(sql, /CREATE TABLE `invoice_commitment_shares`/);
    const copy = indexOf(sql, /INSERT INTO `invoice_commitment_shares`/);
    expect(check).toBe(0);
    expect(create).toBeGreaterThan(check);
    expect(copy).toBeGreaterThan(create);
    expect(sql[copy]).toMatch(/GROUP BY `invoice_id_fk`, `commitment_id_fk`, `commitment_fiscal_year`/);
    expect(sql[copy]).toMatch(/IF\(MIN\(`commitment_auto`\) = 0, 'MANUAL', 'AUTO'\)/);
    expect(sql[copy]).toMatch(/SUM\(`amount`\)/);
    expect(sql[copy]).toMatch(/WHERE `commitment_id_fk` IS NOT NULL/);
  });

  it('up si ferma elencando le fatture con righe su più impegni o miste auto/manuali', async () => {
    const { runner, sql } = fakeRunner([{ invoice_id_fk: 7 }, { invoice_id_fk: 9 }]);
    await expect(new InvoiceCommitmentShares1796000000000().up(runner)).rejects.toThrow(/7, 9/);
    expect(indexOf(sql, /CREATE TABLE/)).toBe(-1);
  });

  it('down elimina la tabella', async () => {
    const { runner, sql } = fakeRunner();
    await new InvoiceCommitmentShares1796000000000().down(runner);
    expect(sql.some((q) => /DROP TABLE `invoice_commitment_shares`/.test(q))).toBe(true);
  });
});
