import { MergeUtilityNotes1792600000000 } from './migrations/1792600000000-MergeUtilityNotes';

const runner = (left: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return [{ left }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('MergeUtilityNotes', () => {
  it('con colonne vuote fa drop di entrambe', async () => {
    const { q, ddl } = runner(0);
    await new MergeUtilityNotes1792600000000().up(q);
    expect(ddl.join(' ')).toContain('DROP COLUMN `additional_notes`');
    expect(ddl.join(' ')).toContain('DROP COLUMN `specifications`');
  });
  it('con valori ancora presenti si ferma prima di ogni DDL', async () => {
    const { q, ddl } = runner(3);
    await expect(new MergeUtilityNotes1792600000000().up(q)).rejects.toThrow('3 utenze');
    expect(ddl).toHaveLength(0);
  });
});
