import { QueryRunner } from 'typeorm';
import { ThirdParties1791500000000 } from './migrations/1791500000000-ThirdParties';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
// QueryRunner simulato: ogni query è registrata, le risposte dipendono dal testo.
function runner(answers: { match: RegExp; rows: unknown[] }[] = []) {
  const sql: string[] = [];
  const q = {
    query: jest.fn(async (s: string) => {
      sql.push(s);
      return answers.find((a) => a.match.test(s))?.rows ?? [];
    }),
  } as unknown as QueryRunner;
  return { q, sql };
}

describe('Migration ThirdParties1791500000000', () => {
  const migration = new ThirdParties1791500000000();

  it('si ferma prima di qualunque DDL se i dati violano i nuovi vincoli', async () => {
    const { q, sql } = runner([
      { match: /-- preflight: vat duplicata/, rows: [{ v: '01318460688' }] },
      { match: /-- preflight: consip orfane/, rows: [{ id: 9 }] },
    ]);
    await expect(migration.up(q)).rejects.toThrow(/P\.IVA duplicata: 01318460688[\s\S]*CONSIP[\s\S]*9/);
    expect(sql.some((s) => /CREATE TABLE|ALTER TABLE|DROP/.test(s))).toBe(false);
  });

  it('elimina l\'indice unique residuo del vecchio OneToOne su consip_agreement.supplier_id', async () => {
    const { q, sql } = runner([
      { match: /NON_UNIQUE = 0/, rows: [{ idx: 'REL_4865ffe2d0c44ceb3728328eeb' }] },
    ]);
    await migration.up(q);
    expect(sql).toContain(
      'ALTER TABLE `consip_agreement` DROP INDEX `REL_4865ffe2d0c44ceb3728328eeb`',
    );
    // Indice non unique atteso dall'entity (@Index su supplier_id).
    expect(sql.some((s) => s.includes('CREATE INDEX `IDX_4865ffe2d0c44ceb3728328eeb`'))).toBe(true);
  });

  it("non ricrea l'indice dell'entity se c'è già", async () => {
    const { q, sql } = runner([
      { match: /INDEX_NAME = 'IDX_4865ffe2d0c44ceb3728328eeb'/, rows: [{ idx: 'IDX_4865ffe2d0c44ceb3728328eeb' }] },
    ]);
    await migration.up(q);
    expect(sql.some((s) => s.includes('CREATE INDEX `IDX_4865ffe2d0c44ceb3728328eeb`'))).toBe(false);
  });
});
