import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import { AppModule } from '@/app.module';
import { DataImporterService } from '@/data-importer/data-importer.service';

/**
 * Script one-off per lanciare l'import completo senza passare dall'endpoint HTTP
 * (bypassa JwtAuthGuard/RolesGuard). Uso: rehearsal/reimport dati da UTENZE.accdb.
 * Esecuzione: node -r ts-node/register -r tsconfig-paths/register src/scripts/run-import.ts
 *
 * Scrive il risultato su file (non stdout): su Windows un process.exit() subito dopo
 * una grande console.log() su pipe puo' troncare l'output prima del flush.
 */
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const importer = app.get(DataImporterService);
    const result = await importer.importAll();
    fs.writeFileSync('/tmp/import-result.json', JSON.stringify(result, null, 2));
    console.log('Risultato scritto in /tmp/import-result.json (nel container)');
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
