import { FatturePerUtenzaImpegni1792900000000 } from './migrations/1792900000000-FatturePerUtenzaImpegni';

// QueryRunner simulato: risponde alla SELECT di controllo, registra le DDL.
const runner = (ibcRows: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('AS n FROM `invoice_budget_chapter`')) return [{ n: ibcRows }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('FatturePerUtenzaImpegni', () => {
  const m = new FatturePerUtenzaImpegni1792900000000();

  it('crea impegni e righe, aggiunge fornitore e totale, toglie invoice_budget_chapter', async () => {
    const { q, ddl } = runner(0);
    await m.up(q);
    const all = ddl.join('\n');
    expect(all).toContain('CREATE TABLE `budget_commitments`');
    expect(all).toContain('CREATE TABLE `invoice_lines`');
    expect(all).toContain('ADD `supplier_id_fk` int NULL');
    expect(all).toContain('ADD `total_amount` decimal(18,2) NULL');
    expect(all).toContain('MODIFY `net_amount_excl_vat` decimal(18,2) NULL');
    expect(all).toContain('DROP TABLE `invoice_budget_chapter`');
    expect(all).toContain('ON DELETE CASCADE');
  });

  it('si ferma prima di ogni DDL se invoice_budget_chapter ha righe', async () => {
    const { q, ddl } = runner(4);
    await expect(m.up(q)).rejects.toThrow('invoice_budget_chapter: 4 righe');
    expect(ddl).toHaveLength(0);
  });

  it('down ricrea invoice_budget_chapter e rimette l’imponibile NOT NULL', async () => {
    const { q, ddl } = runner(0);
    await m.down(q);
    const all = ddl.join('\n');
    expect(all).toContain('CREATE TABLE `invoice_budget_chapter`');
    expect(all).toContain(
      'UPDATE `invoices` SET `net_amount_excl_vat` = 0 WHERE `net_amount_excl_vat` IS NULL',
    );
    expect(all).toContain("MODIFY `net_amount_excl_vat` decimal(18,2) NOT NULL DEFAULT '0.00'");
    expect(all).toContain('DROP TABLE `invoice_lines`');
    expect(all).toContain('DROP TABLE `budget_commitments`');
  });
});
