import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

function readCsv(filePath: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const results: Record<string, string>[] = [];
    fs.createReadStream(filePath, { encoding: 'latin1' })
      .pipe(csv({ separator: ';' }))
      .on('data', (row: Record<string, string>) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get<DataSource>(getDataSourceToken());

  const rows = await readCsv(
    path.join(process.cwd(), 'src', 'data-importer', 'source', 'utenze.csv'),
  );

  const checks: { csvCol: string; table: string; nameCol: string }[] = [
    { csvCol: 'tipo utenza', table: 'utility_types', nameCol: 'name' },
    { csvCol: 'consumi a carico di', table: 'costs_borne_by', nameCol: 'name' },
    { csvCol: 'gestione manutenzione', table: 'maintenance_managers', nameCol: 'code' },
    { csvCol: 'mercato di provenienza', table: 'consip_agreement', nameCol: 'name' },
    { csvCol: 'fornitore', table: 'suppliers', nameCol: 'supplier_id' },
  ];

  for (const check of checks) {
    const csvValues = new Set<string>();
    for (const r of rows) {
      const v = (r[check.csvCol] || '').trim();
      if (v) csvValues.add(v);
    }
    const dbRows: { n: string }[] = await ds.query(
      `SELECT ${check.nameCol} as n FROM ${check.table} WHERE deleted = 0`,
    );
    const dbValues = new Set(dbRows.map((r) => r.n.trim().toLowerCase()));

    const missing = [...csvValues].filter((v) => !dbValues.has(v.toLowerCase()));
    console.log(`\n=== ${check.csvCol} -> ${check.table}.${check.nameCol} ===`);
    console.log('valori CSV distinti:', csvValues.size, '| valori DB:', dbValues.size);
    console.log('MANCANTI nel DB (causano FK null/errore):', missing);
  }

  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
