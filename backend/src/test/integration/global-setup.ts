import { execSync } from 'child_process';
import { createConnection } from 'mysql2/promise';
import { join } from 'path';
import { assertTestDatabase } from './test-database';

// Una volta per giro: database di test cancellato, ricreato e portato all'ultima migration
// con la CLI TypeORM (stesso comando di scripts/check-migrations.sh).
export default async function globalSetup(): Promise<void> {
  const database = assertTestDatabase(process.env.MYSQL_DB);
  process.env.MYSQL_DB = database;

  const connection = await createConnection({
    host: process.env.MYSQL_HOST || 'mysql',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  } finally {
    await connection.end();
  }

  execSync(
    'node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts',
    { cwd: join(__dirname, '..', '..', '..'), env: { ...process.env, MYSQL_DB: database }, stdio: 'pipe' },
  );
}
