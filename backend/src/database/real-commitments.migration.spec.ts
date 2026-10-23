import { QueryRunner } from 'typeorm';
import { RealCommitments1795800000000 } from './migrations/1795800000000-RealCommitments';

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

describe('RealCommitments migration', () => {
  it('up copia i contratti nella tabella N-N prima di togliere contract_id_fk', async () => {
    const { runner, sql } = fakeRunner();
    await new RealCommitments1795800000000().up(runner);
    const insert = indexOf(sql, /INSERT INTO `budget_commitment_contracts`/);
    const drop = indexOf(sql, /DROP COLUMN `contract_id_fk`/);
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(insert);
  });

  it('up porta il vecchio numero impegno nelle note prima di togliere la colonna', async () => {
    const { runner, sql } = fakeRunner();
    await new RealCommitments1795800000000().up(runner);
    const move = indexOf(sql, /SET `notes` = .*commitment_number/);
    const drop = indexOf(sql, /DROP COLUMN `commitment_number`/);
    expect(move).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(move);
  });

  it('down rimette il vecchio numero dalle note e ne toglie il prefisso (up → down → up senza doppioni)', async () => {
    const { runner, sql } = fakeRunner();
    await new RealCommitments1795800000000().down(runner);
    const structured = indexOf(sql, /SET `commitment_number` = CONCAT\(`commitment_year`/);
    const fromNotes = indexOf(sql, /SET `commitment_number` = SUBSTRING_INDEX[\s\S]*`notes` LIKE 'Numero: %'/);
    expect(structured).toBeGreaterThanOrEqual(0);
    expect(fromNotes).toBeGreaterThan(structured);
  });

  it('down rimette contract_id_fk dal primo contratto collegato', async () => {
    const { runner, sql } = fakeRunner();
    await new RealCommitments1795800000000().down(runner);
    const restore = indexOf(sql, /MIN\(`?contract_id`?\)/);
    const dropTable = indexOf(sql, /DROP TABLE `budget_commitment_contracts`/);
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(dropTable).toBeGreaterThan(restore);
  });
});
