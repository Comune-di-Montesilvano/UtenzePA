import 'reflect-metadata';
import { DataSource } from 'typeorm';

// DataSource per la CLI TypeORM (migration:generate / migration:run).
// Il runtime dell'app usa mysql.module.ts, che condivide le stesse entity
// (via glob, non un elenco esplicito: niente rischio di disallineamento).
export default new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST || 'mysql',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  username: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'password',
  database: process.env.MYSQL_DB || 'mydatabase',
  entities: [`${__dirname}/../apis/**/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
});
