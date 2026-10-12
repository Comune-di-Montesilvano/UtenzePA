import { AssetCadastralUnits1793700000000 } from './migrations/1793700000000-AssetCadastralUnits';

// n = immobili con foglio senza particella (o viceversa); orphan = immobili
// senza foglio e particella ma con sub, categoria o rendita.
const runner = (n: number, orphan = 0) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return [{ n: sql.includes('cadastral_value') ? orphan : n }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('AssetCadastralUnits', () => {
  it('crea le unità, ci copia il catasto e solo dopo toglie le colonne', async () => {
    const { q, ddl } = runner(0);
    await new AssetCadastralUnits1793700000000().up(q);
    const create = ddl.findIndex((s) => s.startsWith('CREATE TABLE `asset_cadastral_units`'));
    const copy = ddl.findIndex((s) => s.startsWith('INSERT INTO `asset_cadastral_units`'));
    const drop = ddl.findIndex((s) => s.includes('DROP COLUMN `sheet`'));
    expect(create).toBeGreaterThanOrEqual(0);
    expect(copy).toBeGreaterThan(create);
    expect(drop).toBeGreaterThan(copy);
    expect(ddl.join(' ')).toContain('ADD `mef_building_type`');
  });

  it('con fogli senza particella (o viceversa) si ferma prima di ogni DDL', async () => {
    const { q, ddl } = runner(2);
    await expect(new AssetCadastralUnits1793700000000().up(q)).rejects.toThrow(
      '2 immobili con foglio senza particella o viceversa',
    );
    expect(ddl).toHaveLength(0);
  });

  it('con sub, categoria o rendita senza foglio e particella si ferma prima di ogni DDL', async () => {
    const { q, ddl } = runner(0, 3);
    await expect(new AssetCadastralUnits1793700000000().up(q)).rejects.toThrow(
      '3 immobili con subalterno, categoria o rendita ma senza foglio e particella',
    );
    expect(ddl).toHaveLength(0);
  });

  it('down riporta la prima unità sull’immobile prima di eliminare la tabella', async () => {
    const { q, ddl } = runner(0);
    await new AssetCadastralUnits1793700000000().down(q);
    const update = ddl.findIndex((s) => s.startsWith('UPDATE `assets`') && s.includes('MIN(`id`)'));
    const dropTable = ddl.findIndex((s) => s.startsWith('DROP TABLE `asset_cadastral_units`'));
    expect(update).toBeGreaterThanOrEqual(0);
    expect(dropTable).toBeGreaterThan(update);
  });
});
