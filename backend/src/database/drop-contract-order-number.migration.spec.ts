import { DropContractOrderNumber1792800000000 } from './migrations/1792800000000-DropContractOrderNumber';

const runner = (left: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return [{ left }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('DropContractOrderNumber', () => {
  it('con colonna vuota fa drop di order_number', async () => {
    const { q, ddl } = runner(0);
    await new DropContractOrderNumber1792800000000().up(q);
    expect(ddl.join(' ')).toContain('DROP COLUMN `order_number`');
  });
  it('con valori ancora presenti si ferma prima di ogni DDL', async () => {
    const { q, ddl } = runner(2);
    await expect(new DropContractOrderNumber1792800000000().up(q)).rejects.toThrow('2 contratti');
    expect(ddl).toHaveLength(0);
  });
});
