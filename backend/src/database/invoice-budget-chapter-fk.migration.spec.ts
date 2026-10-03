import { InvoiceBudgetChapterFk1792200000000 } from './migrations/1792200000000-InvoiceBudgetChapterFk';

// QueryRunner simulato: risponde alle SELECT di controllo, registra le DDL.
const runner = (existing: string[], orphans: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('information_schema')) return existing.map((name) => ({ name }));
    if (sql.includes('orphans')) return [{ orphans }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('InvoiceBudgetChapterFk', () => {
  const m = new InvoiceBudgetChapterFk1792200000000();

  it('aggiunge le due FK se mancano', async () => {
    const { q, ddl } = runner([], 0);
    await m.up(q);
    expect(ddl).toHaveLength(2);
    expect(ddl[0]).toContain('FK_891310b3d845fe3f7d00346e65b');
    expect(ddl[1]).toContain('FK_9cffdf1bcf101d43271ac87c53d');
  });

  it('non duplica le FK già presenti', async () => {
    const { q, ddl } = runner(
      ['FK_891310b3d845fe3f7d00346e65b', 'FK_9cffdf1bcf101d43271ac87c53d'],
      0,
    );
    await m.up(q);
    expect(ddl).toHaveLength(0);
  });

  it('si ferma con errore leggibile se ci sono righe orfane', async () => {
    const { q, ddl } = runner([], 3);
    await expect(m.up(q)).rejects.toThrow('invoice_budget_chapter: 3 righe orfane');
    expect(ddl).toHaveLength(0);
  });
});
