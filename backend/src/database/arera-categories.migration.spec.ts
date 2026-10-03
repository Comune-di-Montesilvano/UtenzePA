import { QueryRunner } from 'typeorm';
import { AreraCategories1791600000000 } from './migrations/1791600000000-AreraCategories';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
function runner(answers: { match: RegExp; rows: unknown[] }[] = []) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const q = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return answers.find((a) => a.match.test(sql))?.rows ?? [];
    }),
  } as unknown as QueryRunner;
  return { q, calls };
}

describe('Migration AreraCategories1791600000000', () => {
  const migration = new AreraCategories1791600000000();

  it('si ferma prima di qualunque DDL se trova un valore di disalimentabilità non previsto', async () => {
    const { q, calls } = runner([
      { match: /-- preflight: disalimentabilità/, rows: [{ v: 'disalimentabile per E-DISTRIBUZIONE' }, { v: 'forse' }] },
    ]);
    await expect(migration.up(q)).rejects.toThrow(/forse/);
    expect(calls.some((c) => /ALTER TABLE|DROP|CREATE/.test(c.sql))).toBe(false);
  });

  it('converte i testi noti in sì/no, nota solo dove il testo dice di più, senza toccare update_date', async () => {
    const { q, calls } = runner();
    await migration.up(q);
    const conv = calls.filter((c) => c.sql.includes('SET `disconnectable`'));
    expect(conv.map((c) => c.params)).toEqual([
      [1, 1, 'disalimentabile per e-distribuzione'],
      [0, 1, 'non disalimentabile per e-distribuzione'],
      [0, 0, 'non disalimentabile'],
      [1, 1, 'uso pubblico disalim afd'],
      [1, 0, 'disalimentabile'],
    ]);
    for (const c of conv) expect(c.sql).toContain('`update_date` = `update_date`');
  });

  it('aggiunge le colonne prima di convertire e toglie testo e finalità dopo', async () => {
    const { q, calls } = runner();
    await migration.up(q);
    const idx = (re: RegExp) => calls.findIndex((c) => re.test(c.sql));
    expect(idx(/ADD `arera_category` enum \('EL_BT_DOMESTIC'/)).toBeGreaterThan(-1);
    expect(idx(/ADD `disconnectable` tinyint\(1\) NULL/)).toBeLessThan(idx(/SET `disconnectable`/));
    expect(idx(/DROP COLUMN `disconnection_ability`/)).toBeGreaterThan(idx(/SET `disconnectable`/));
    // utility_type_purpose prima di purpose (le sue FK puntano a purpose).
    expect(idx(/DROP TABLE `utility_type_purpose`/)).toBeLessThan(idx(/DROP TABLE `purpose`/));
  });

  it('down ricrea il testo dal booleano e le tabelle finalità vuote', async () => {
    const { q, calls } = runner();
    await migration.down(q);
    const sql = calls.map((c) => c.sql).join('\n');
    expect(sql).toContain("WHEN 1 THEN 'disalimentabile' WHEN 0 THEN 'non disalimentabile'");
    expect(sql).toContain('CREATE TABLE `purpose`');
    expect(sql).toContain('CREATE TABLE `utility_type_purpose`');
    expect(sql).toContain('DROP COLUMN `arera_category`');
  });
});
