import { QueryRunner } from 'typeorm';
import { AttachmentsAndActs1794100000000 } from './migrations/1794100000000-AttachmentsAndActs';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
function runner(userId: number | null) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const q = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return sql.includes('FROM `system_users`') ? [{ id: userId }] : [];
    }),
  } as unknown as QueryRunner;
  return { q, calls };
}

describe('Migration AttachmentsAndActs1794100000000', () => {
  const migration = new AttachmentsAndActs1794100000000();
  const inserts = (calls: { sql: string; params?: unknown[] }[]) =>
    calls.filter((c) => c.sql.startsWith('INSERT INTO `act_types`'));

  it('installazione nuova (nessun utente): tabelle create, nessun tipo inserito', async () => {
    const { q, calls } = runner(null);
    await migration.up(q);
    expect(calls.some((c) => c.sql.includes('CREATE TABLE `act_types`'))).toBe(true);
    expect(inserts(calls)).toEqual([]);
  });

  it('tipi iniziali con autore il primo Admin (non un id fisso)', async () => {
    const { q, calls } = runner(7);
    await migration.up(q);
    const rows = inserts(calls);
    expect(rows).toHaveLength(7);
    expect(rows[0].params).toEqual(['Delibera di Giunta', 10, 7, 7, 'Delibera di Giunta']);
  });
});
