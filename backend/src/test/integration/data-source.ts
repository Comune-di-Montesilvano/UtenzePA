import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { assertTestDatabase } from './test-database';

// DataSource sul database dei test d'integrazione, stesse entity dell'app (glob come
// src/database/data-source.ts). Uno per file di test: `destroy()` in afterAll.
export async function itDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST || 'mysql',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: assertTestDatabase(process.env.MYSQL_DB),
    // Opzioni come mysql.module.ts (invalidWhereValuesBehavior di default = 'throw').
    entities: [`${__dirname}/../../apis/**/*.entity{.ts,.js}`],
  });
  return ds.initialize();
}

// Tabelle svuotate prima di ogni test (vincoli FK sospesi solo per questa connessione).
export async function resetTables(ds: DataSource, tables: string[]): Promise<void> {
  const runner = ds.createQueryRunner();
  try {
    await runner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) await runner.query(`DELETE FROM \`${table}\``);
    await runner.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await runner.release();
  }
}
