# Backup DB e Importazione Dati da UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere backup/restore del database MySQL (manuale da UI + schedulato via cron, con retention) e un import CSV generico da UI (affiancato al `data-importer` esistente, che resta invariato), entrambi riservati al ruolo `Admin` e con upload a chunk da 1MB (vincolo del reverse proxy di produzione).

**Architecture:** Due nuovi moduli NestJS (`apis/backup`, `apis/import`) più un componente condiviso `common/chunked-upload` per l'upload a chunk (usato da entrambi). `backup` esegue `mysqldump`/`mysql` via `child_process.execFile`. `import` riusa la logica di parsing già scritta in `DataImporterService` aggiungendo un parametro opzionale di path file (nessuna modifica di comportamento per i chiamanti esistenti). Frontend: una pagina standalone con due tab (Backup, Importa) sotto il menu "Impostazioni", riservata ad Admin lato backend.

**Tech Stack:** NestJS 11 + TypeORM + MySQL, `@nestjs/platform-express` (multer) per upload, `@nestjs/schedule` per il cron, Angular 20 standalone components + PrimeNG 20.

## Global Constraints

- Solo ruolo `Admin` può accedere a backup/restore/import (spec, sez. "Sicurezza").
- Upload (file `.sql` di restore, file CSV di import) SEMPRE a chunk da 1MB — mai multipart in singola richiesta (limite reverse proxy di produzione).
- `mysqldump`/`mysql` eseguiti SOLO via `child_process.execFile` o `child_process.spawn` con argomenti array — mai `exec`/stringa shell. `mysql` in restore usa `spawn` (serve pipare lo stdin, `execFile` async non supporta l'opzione `input`); `mysqldump` in backup usa `execFile` (output via `--result-file`, nessuno stdin da pipare).
- Password DB passata al processo figlio via env `MYSQL_PWD`, mai in argv.
- `data-importer/` esistente NON deve cambiare comportamento esterno (stessi endpoint, stessa risposta) — le uniche modifiche ammesse sono parametri opzionali retrocompatibili.
- Comandi jest sempre con `--maxWorkers=2` (vedi CLAUDE.md).
- Nessun test frontend: il progetto non ha convenzione di test Angular esistente (nessun file `*.spec.ts` sotto `frontend/src/app/pages`) — verifica manuale via `ng serve`/build, coerente con lo stato attuale del repo.

---

## File Structure

**Backend — nuovi file:**
- `backend/src/common/chunked-upload/chunked-upload.service.ts` — assemblaggio chunk generico (usato da backup e import)
- `backend/src/common/chunked-upload/chunked-upload.service.spec.ts`
- `backend/src/common/chunked-upload/chunked-upload.module.ts`
- `backend/src/apis/backup/backup.module.ts`
- `backend/src/apis/backup/backup.service.ts` — creazione/lista/cancellazione backup, restore, retention
- `backend/src/apis/backup/backup.service.spec.ts`
- `backend/src/apis/backup/backup.controller.ts`
- `backend/src/apis/backup/backup.controller.spec.ts`
- `backend/src/apis/backup/dto/upload-chunk.dto.ts`
- `backend/src/apis/backup/dto/restore-finalize.dto.ts`
- `backend/src/apis/import/import.module.ts`
- `backend/src/apis/import/import.service.ts` — delega a `DataImporterService` con path custom
- `backend/src/apis/import/import.service.spec.ts`
- `backend/src/apis/import/import.controller.ts`
- `backend/src/apis/import/import.controller.spec.ts`
- `backend/src/apis/import/entity-type.enum.ts`

**Backend — file modificati:**
- `backend/Dockerfile` — `apk add mysql-client` su stage `development` e `production`
- `backend/package.json` — aggiunta devDependency `@types/multer`
- `backend/src/data-importer/data-importer.service.ts` — ogni metodo `importXxx()` accetta un `filePath?: string` opzionale (default: path fisso attuale)
- `backend/src/app.module.ts` — registrazione `BackupModule`, `ImportModule`
- root `docker-compose.yml` — volume named `backups_data` montato su `/usr/src/app/backups` nel servizio `api`
- root `docker-compose.override.yml` — bind mount `./backups:/usr/src/app/backups` nel servizio `api` (dev)
- root `.env.example` — nuove variabili `BACKUP_CRON_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `BACKUP_MAX_SIZE_MB`, `IMPORT_MAX_SIZE_MB`

**Frontend — nuovi file:**
- `frontend/src/app/pages/backup-import/backup-import.component.ts`
- `frontend/src/app/pages/backup-import/backup-import.component.html`
- `frontend/src/app/pages/backup-import/backup.service.ts`
- `frontend/src/app/pages/backup-import/import.service.ts`
- `frontend/src/app/services/chunked-upload.service.ts`

**Frontend — file modificati:**
- `frontend/src/app/app.routes.ts` — nuova route `/backup-import`
- `frontend/src/app/comp/sidebar/sidebar.component.ts` — nuova voce menu sotto "Impostazioni"

---

## Task 1: Dockerfile + Docker Compose + env vars

**Files:**
- Modify: `backend/Dockerfile:122-148` (stage `development`), `backend/Dockerfile:76-118` (stage `production`)
- Modify: `docker-compose.yml`
- Modify: `docker-compose.override.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: directory `/usr/src/app/backups` scrivibile dal processo Node dentro il container `api`, sia in dev sia in prod. Env vars `BACKUP_CRON_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `BACKUP_MAX_SIZE_MB`, `IMPORT_MAX_SIZE_MB` disponibili via `process.env` (Task 6, 4, 9).

- [ ] **Step 1: Aggiungi `mysql-client` allo stage `development` del Dockerfile**

In `backend/Dockerfile`, riga 140 (dopo `RUN apk add --no-cache curl`), aggiungi:

```dockerfile
# Install mysql-client (mysqldump/mysql CLI, usati dal modulo backup)
RUN apk add --no-cache mysql-client
```

- [ ] **Step 2: Aggiungi `mysql-client` allo stage `production` del Dockerfile**

In `backend/Dockerfile`, subito dopo la riga 97 (`RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs`), aggiungi:

```dockerfile
# Install mysql-client (mysqldump/mysql CLI, usati dal modulo backup)
RUN apk add --no-cache mysql-client
```

- [ ] **Step 3: Crea la directory backup nello stage `production` e assegna i permessi**

Subito dopo lo step precedente, prima di `WORKDIR /usr/src/app`, non serve creare la dir esplicitamente: verrà creata a runtime da `BackupService` (Task 4) con `fs.mkdirSync(dir, { recursive: true })`. Nessuna azione aggiuntiva qui.

- [ ] **Step 4: Aggiungi il volume backup a `docker-compose.yml` (produzione)**

Apri `docker-compose.yml`, trova il servizio `api` e la sua sezione `volumes:` (se assente, aggiungila). Aggiungi:

```yaml
    volumes:
      - backups_data:/usr/src/app/backups
```

Nella sezione `volumes:` di root (top-level), aggiungi:

```yaml
volumes:
  backups_data:
```

(Se `docker-compose.yml` ha già una sezione `volumes:` top-level con altri volumi named, aggiungi `backups_data:` come voce in più, senza toccare gli altri.)

- [ ] **Step 5: Aggiungi il bind mount backup a `docker-compose.override.yml` (dev)**

Apri `docker-compose.override.yml`, trova il servizio `api`, aggiungi al suo `volumes:` (bind mount, coerente con lo stile dev del resto del file):

```yaml
      - ./backend/backups:/usr/src/app/backups
```

- [ ] **Step 6: Aggiungi le nuove env var a `.env.example` (root)**

Apri `.env.example`, aggiungi in fondo:

```bash
# Backup DB — schedulazione cron (formato @nestjs/schedule / cron standard),
# retention in giorni, dimensione massima upload (restore/import) in MB.
BACKUP_CRON_SCHEDULE=0 0 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_MAX_SIZE_MB=500
IMPORT_MAX_SIZE_MB=50
```

- [ ] **Step 7: Verifica build Docker**

Run: `docker compose build api`
Expected: build completato senza errori, nessun fallimento su `apk add mysql-client`.

- [ ] **Step 8: Commit**

```bash
git add backend/Dockerfile docker-compose.yml docker-compose.override.yml .env.example
git commit -m "chore: prepara infrastruttura Docker per backup DB (mysql-client, volume, env)"
```

---

## Task 2: `@types/multer` devDependency

**Files:**
- Modify: `backend/package.json`

**Interfaces:**
- Produces: tipo `Express.Multer.File` disponibile in TypeScript per i controller che useranno `@UploadedFile()` (Task 5, 10).

- [ ] **Step 1: Installa `@types/multer`**

Run (dentro il container, come da convenzione CLAUDE.md):
```bash
docker exec utenzepa-api-1 npm install --save-dev @types/multer
```

Se il container non è già in esecuzione con l'override di sviluppo, avvialo prima con `docker compose up -d`.

- [ ] **Step 2: Verifica type-check**

Run: `docker exec utenzepa-api-1 npm run type-check`
Expected: nessun nuovo errore introdotto (il pacchetto è solo aggiunto, non ancora usato).

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps-dev): add @types/multer per upload chunked backup/import"
```

---

## Task 3: ChunkedUploadService condiviso

**Files:**
- Create: `backend/src/common/chunked-upload/chunked-upload.service.ts`
- Create: `backend/src/common/chunked-upload/chunked-upload.module.ts`
- Test: `backend/src/common/chunked-upload/chunked-upload.service.spec.ts`

**Interfaces:**
- Produces:
  - `class ChunkedUploadService`
  - `saveChunk(uploadId: string, chunkIndex: number, totalChunks: number, buffer: Buffer, destDir: string): void`
  - `isComplete(uploadId: string, totalChunks: number, destDir: string): boolean`
  - `assemble(uploadId: string, totalChunks: number, destDir: string, finalFileName: string): string` — ritorna il path assoluto del file assemblato, elimina i chunk temporanei dopo l'assemblaggio (anche in caso di errore, via `try/finally`)
  - `cleanup(uploadId: string, totalChunks: number, destDir: string): void` — rimuove eventuali chunk orfani (usato anche da `assemble` internamente)
- Consumes: nessuna dipendenza da altri task (solo `fs`, `path`, entrambi built-in Node).

- [ ] **Step 1: Scrivi il test che fallisce (salvataggio e assemblaggio in ordine)**

```typescript
// backend/src/common/chunked-upload/chunked-upload.service.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChunkedUploadService } from './chunked-upload.service';

describe('ChunkedUploadService', () => {
  let service: ChunkedUploadService;
  let destDir: string;

  beforeEach(() => {
    service = new ChunkedUploadService();
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-upload-test-'));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it('assembla i chunk nell\'ordine corretto quando tutti sono presenti', () => {
    const uploadId = 'test-upload-1';
    service.saveChunk(uploadId, 0, 3, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 3, Buffer.from('BBB'), destDir);
    service.saveChunk(uploadId, 2, 3, Buffer.from('CCC'), destDir);

    const finalPath = service.assemble(uploadId, 3, destDir, 'result.txt');

    expect(fs.readFileSync(finalPath, 'utf-8')).toBe('AAABBBCCC');
  });

  it('accetta i chunk anche fuori ordine', () => {
    const uploadId = 'test-upload-2';
    service.saveChunk(uploadId, 2, 3, Buffer.from('CCC'), destDir);
    service.saveChunk(uploadId, 0, 3, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 3, Buffer.from('BBB'), destDir);

    const finalPath = service.assemble(uploadId, 3, destDir, 'result.txt');

    expect(fs.readFileSync(finalPath, 'utf-8')).toBe('AAABBBCCC');
  });

  it('isComplete ritorna false se mancano chunk', () => {
    const uploadId = 'test-upload-3';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);

    expect(service.isComplete(uploadId, 2, destDir)).toBe(false);
  });

  it('isComplete ritorna true quando tutti i chunk sono presenti', () => {
    const uploadId = 'test-upload-4';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 2, Buffer.from('BBB'), destDir);

    expect(service.isComplete(uploadId, 2, destDir)).toBe(true);
  });

  it('assemble lancia errore se un chunk manca', () => {
    const uploadId = 'test-upload-5';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);

    expect(() => service.assemble(uploadId, 2, destDir, 'result.txt')).toThrow(
      'Chunk mancanti per upload test-upload-5',
    );
  });

  it('assemble rimuove i file temporanei dopo il completamento', () => {
    const uploadId = 'test-upload-6';
    service.saveChunk(uploadId, 0, 1, Buffer.from('AAA'), destDir);
    service.assemble(uploadId, 1, destDir, 'result.txt');

    const remaining = fs.readdirSync(destDir).filter((f) => f.includes(uploadId));
    expect(remaining).toEqual([]);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest common/chunked-upload --maxWorkers=2`
Expected: FAIL — `Cannot find module './chunked-upload.service'`

- [ ] **Step 3: Implementa `ChunkedUploadService`**

```typescript
// backend/src/common/chunked-upload/chunked-upload.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChunkedUploadService {
  private chunkFileName(uploadId: string, chunkIndex: number): string {
    return `${uploadId}.chunk${chunkIndex}`;
  }

  saveChunk(
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    buffer: Buffer,
    destDir: string,
  ): void {
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new Error(`chunkIndex ${chunkIndex} fuori range (totalChunks=${totalChunks})`);
    }
    fs.mkdirSync(destDir, { recursive: true });
    const chunkPath = path.join(destDir, this.chunkFileName(uploadId, chunkIndex));
    fs.writeFileSync(chunkPath, buffer);
  }

  isComplete(uploadId: string, totalChunks: number, destDir: string): boolean {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
      if (!fs.existsSync(chunkPath)) return false;
    }
    return true;
  }

  assemble(uploadId: string, totalChunks: number, destDir: string, finalFileName: string): string {
    if (!this.isComplete(uploadId, totalChunks, destDir)) {
      throw new Error(`Chunk mancanti per upload ${uploadId}`);
    }

    const finalPath = path.join(destDir, finalFileName);
    try {
      const writeStream = fs.openSync(finalPath, 'w');
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
        const chunkBuffer = fs.readFileSync(chunkPath);
        fs.writeSync(writeStream, chunkBuffer);
      }
      fs.closeSync(writeStream);
      return finalPath;
    } finally {
      this.cleanup(uploadId, totalChunks, destDir);
    }
  }

  cleanup(uploadId: string, totalChunks: number, destDir: string): void {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    }
  }
}
```

- [ ] **Step 4: Crea il modulo**

```typescript
// backend/src/common/chunked-upload/chunked-upload.module.ts
import { Module } from '@nestjs/common';
import { ChunkedUploadService } from './chunked-upload.service';

@Module({
  providers: [ChunkedUploadService],
  exports: [ChunkedUploadService],
})
export class ChunkedUploadModule {}
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest common/chunked-upload --maxWorkers=2`
Expected: PASS (6 test)

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/chunked-upload
git commit -m "feat: aggiungi ChunkedUploadService condiviso per upload a chunk"
```

---

## Task 4: BackupService — creazione, lista, cancellazione

**Files:**
- Create: `backend/src/apis/backup/backup.service.ts`
- Test: `backend/src/apis/backup/backup.service.spec.ts`

**Interfaces:**
- Consumes: nessuna dipendenza da altri task per questa parte (restore e cron arrivano nei Task 5/6, stesso file, stessa classe, estesa).
- Produces:
  - `class BackupService`
  - `readonly backupDir: string` (da env, default `path.join(process.cwd(), 'backups')`)
  - `createBackup(): Promise<{ filename: string; size: number; createdAt: Date }>`
  - `listBackups(): Promise<{ filename: string; size: number; createdAt: Date }[]>`
  - `deleteBackup(filename: string): Promise<void>`
  - `getBackupPath(filename: string): string` — valida il filename con whitelist regex, lancia se non valido

- [ ] **Step 1: Scrivi il test che fallisce**

```typescript
// backend/src/apis/backup/backup.service.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { BackupService } from './backup.service';

jest.mock('child_process');

describe('BackupService', () => {
  let service: BackupService;
  let backupDir: string;

  beforeEach(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-test-'));
    process.env.BACKUP_DIR = backupDir;
    process.env.MYSQL_HOST = 'localhost';
    process.env.MYSQL_PORT = '3306';
    process.env.MYSQL_USER = 'root';
    process.env.MYSQL_PASSWORD = 'secret';
    process.env.MYSQL_DB = 'mydatabase';
    service = new BackupService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(backupDir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
  });

  it('createBackup esegue mysqldump con execFile e argomenti array', async () => {
    (childProcess.execFile as unknown as jest.Mock).mockImplementation(
      (_cmd, args: string[], _opts, cb) => {
        const outPath = args[args.length - 1];
        // simula mysqldump: scrive un file di output non vuoto
        fs.writeFileSync(outPath.replace(/^--result-file=/, ''), 'SQL DUMP CONTENT');
        cb(null, '', '');
      },
    );

    const result = await service.createBackup();

    expect(result.filename).toMatch(/^utenzepa_\d{8}_\d{6}\.sql$/);
    expect(fs.existsSync(path.join(backupDir, result.filename))).toBe(true);
    expect(childProcess.execFile).toHaveBeenCalledWith(
      'mysqldump',
      expect.arrayContaining(['--host=localhost', '--port=3306', '--user=root', 'mydatabase']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('createBackup non lascia file parziali se mysqldump fallisce', async () => {
    (childProcess.execFile as unknown as jest.Mock).mockImplementation((_cmd, _args, _opts, cb) => {
      cb(new Error('mysqldump: connection refused'), '', 'error');
    });

    await expect(service.createBackup()).rejects.toThrow('connection refused');
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it('listBackups ritorna i file .sql ordinati dal più recente', async () => {
    fs.writeFileSync(path.join(backupDir, 'utenzepa_20260101_000000.sql'), 'a');
    fs.writeFileSync(path.join(backupDir, 'utenzepa_20260201_000000.sql'), 'bb');

    const list = await service.listBackups();

    expect(list.map((b) => b.filename)).toEqual([
      'utenzepa_20260201_000000.sql',
      'utenzepa_20260101_000000.sql',
    ]);
    expect(list[0].size).toBe(2);
  });

  it('deleteBackup rimuove il file', async () => {
    const filePath = path.join(backupDir, 'utenzepa_20260101_000000.sql');
    fs.writeFileSync(filePath, 'a');

    await service.deleteBackup('utenzepa_20260101_000000.sql');

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('getBackupPath rifiuta filename non conformi (path traversal)', () => {
    expect(() => service.getBackupPath('../../etc/passwd')).toThrow('Nome file non valido');
    expect(() => service.getBackupPath('utenzepa_20260101_000000.sql')).not.toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: FAIL — `Cannot find module './backup.service'`

- [ ] **Step 3: Implementa `BackupService` (parte creazione/lista/cancellazione)**

```typescript
// backend/src/apis/backup/backup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { promisify } from 'util';

const execFile = promisify(childProcess.execFile);

const FILENAME_PATTERN = /^utenzepa_\d{8}_\d{6}\.sql$/;

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  readonly backupDir: string;

  constructor() {
    this.backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  private buildFilename(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `utenzepa_${y}${mo}${d}_${h}${mi}${s}.sql`;
  }

  getBackupPath(filename: string): string {
    if (!FILENAME_PATTERN.test(filename)) {
      throw new Error('Nome file non valido');
    }
    return path.join(this.backupDir, filename);
  }

  async createBackup(): Promise<BackupInfo> {
    const filename = this.buildFilename(new Date());
    const finalPath = path.join(this.backupDir, filename);
    const tmpPath = `${finalPath}.tmp`;

    const args = [
      `--host=${process.env.MYSQL_HOST}`,
      `--port=${process.env.MYSQL_PORT}`,
      `--user=${process.env.MYSQL_USER}`,
      `--result-file=${tmpPath}`,
      process.env.MYSQL_DB as string,
    ];

    try {
      await execFile('mysqldump', args, {
        env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD },
      });
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      this.logger.error(`Backup fallito: ${(err as Error).message}`);
      throw err;
    }

    const stat = fs.statSync(finalPath);
    this.logger.log(`Backup creato: ${filename} (${stat.size} byte)`);
    return { filename, size: stat.size, createdAt: stat.birthtime };
  }

  async listBackups(): Promise<BackupInfo[]> {
    const files = fs
      .readdirSync(this.backupDir)
      .filter((f) => FILENAME_PATTERN.test(f))
      .map((filename) => {
        const stat = fs.statSync(path.join(this.backupDir, filename));
        return { filename, size: stat.size, createdAt: stat.birthtime };
      });

    return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = this.getBackupPath(filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
```

Nota: `--result-file` di `mysqldump` scrive l'output solo se il comando completa con successo lato client mysqldump; in caso di errore di connessione il file spesso non viene creato affatto — la pulizia esplicita del `.tmp` nel `catch` copre comunque il caso in cui un output parziale sia stato scritto prima dell'errore.

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: PASS (5 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/backup/backup.service.ts backend/src/apis/backup/backup.service.spec.ts
git commit -m "feat: aggiungi BackupService (creazione, lista, cancellazione backup DB)"
```

---

## Task 5: BackupController — endpoint CRUD backup

**Files:**
- Create: `backend/src/apis/backup/backup.controller.ts`
- Test: `backend/src/apis/backup/backup.controller.spec.ts`
- Create: `backend/src/apis/backup/backup.module.ts`

**Interfaces:**
- Consumes: `BackupService` (Task 4) — `createBackup()`, `listBackups()`, `deleteBackup()`, `getBackupPath()`.
- Produces:
  - `POST /api/v1/backup` → `BackupInfo`
  - `GET /api/v1/backup` → `BackupInfo[]`
  - `GET /api/v1/backup/:filename/download` → stream file
  - `DELETE /api/v1/backup/:filename` → `void`
  - tutti protetti da `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('Admin')`

- [ ] **Step 1: Scrivi il test che fallisce**

```typescript
// backend/src/apis/backup/backup.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

describe('BackupController', () => {
  let controller: BackupController;
  let service: jest.Mocked<BackupService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        {
          provide: BackupService,
          useValue: {
            createBackup: jest.fn(),
            listBackups: jest.fn(),
            deleteBackup: jest.fn(),
            getBackupPath: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BackupController);
    service = module.get(BackupService);
  });

  it('create delega a service.createBackup', async () => {
    const info = { filename: 'utenzepa_20260101_000000.sql', size: 10, createdAt: new Date() };
    service.createBackup.mockResolvedValue(info);

    await expect(controller.create()).resolves.toEqual(info);
    expect(service.createBackup).toHaveBeenCalled();
  });

  it('list delega a service.listBackups', async () => {
    service.listBackups.mockResolvedValue([]);

    await expect(controller.list()).resolves.toEqual([]);
  });

  it('remove delega a service.deleteBackup con il filename dal path param', async () => {
    service.deleteBackup.mockResolvedValue(undefined);

    await controller.remove('utenzepa_20260101_000000.sql');

    expect(service.deleteBackup).toHaveBeenCalledWith('utenzepa_20260101_000000.sql');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.controller --maxWorkers=2`
Expected: FAIL — `Cannot find module './backup.controller'`

- [ ] **Step 3: Implementa `BackupController` (parte CRUD)**

```typescript
// backend/src/apis/backup/backup.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { BackupService, BackupInfo } from './backup.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Post()
  create(): Promise<BackupInfo> {
    return this.service.createBackup();
  }

  @Get()
  list(): Promise<BackupInfo[]> {
    return this.service.listBackups();
  }

  @Get(':filename/download')
  download(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    const filePath = this.service.getBackupPath(filename);
    res.set({
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string): Promise<void> {
    return this.service.deleteBackup(filename);
  }
}
```

- [ ] **Step 4: Crea il modulo**

```typescript
// backend/src/apis/backup/backup.module.ts
import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { AuthMysqlModule } from '@apis/auth/auth.module';

@Module({
  imports: [ChunkedUploadModule, AuthMysqlModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
```

(`ChunkedUploadModule` e `AuthMysqlModule` servono per il Task 7 restore — importati già ora per evitare un secondo giro di modifica al modulo.)

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.controller --maxWorkers=2`
Expected: PASS (3 test)

- [ ] **Step 6: Registra `BackupModule` in `app.module.ts`**

In `backend/src/app.module.ts`, aggiungi l'import:

```typescript
import { BackupModule } from '@apis/backup/backup.module';
```

E aggiungi `BackupModule,` all'array `imports` (dopo `DataImporterModule,`).

- [ ] **Step 7: Verifica che l'app si avvii**

Run: `docker exec utenzepa-api-1 npm run build`
Expected: build senza errori.

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/backup backend/src/app.module.ts
git commit -m "feat: aggiungi BackupController con endpoint create/list/download/delete"
```

---

## Task 6: Restore — chunk upload, verifica password, esecuzione

**Files:**
- Modify: `backend/src/apis/backup/backup.service.ts` (aggiunge `restoreFromFile`)
- Modify: `backend/src/apis/backup/backup.service.spec.ts` (aggiunge test)
- Modify: `backend/src/apis/backup/backup.controller.ts` (aggiunge endpoint chunk/finalize)
- Modify: `backend/src/apis/backup/backup.controller.spec.ts` (aggiunge test)
- Create: `backend/src/apis/backup/dto/upload-chunk.dto.ts`
- Create: `backend/src/apis/backup/dto/restore-finalize.dto.ts`

**Interfaces:**
- Consumes: `ChunkedUploadService` (Task 3) — `saveChunk`, `assemble`; `AuthService` (esistente, `@apis/auth/auth.service.ts`) — `validateUser(email: string, password: string): Promise<SystemUser | null>`; `ICurrentUser` (esistente, `@core/auth/decorators/current-user.decorator.ts`) — `{ id, email, role }`.
- Produces:
  - `BackupService.restoreFromFile(filePath: string): Promise<void>`
  - `POST /api/v1/backup/restore/chunk` (multipart: campo file `chunk` + body `uploadId`, `chunkIndex`, `totalChunks`) → `{ received: true }`
  - `POST /api/v1/backup/restore/finalize` (body `{ uploadId, totalChunks, password }`) → `{ restored: true }`

- [ ] **Step 1: Scrivi il test che fallisce per `restoreFromFile`**

Aggiungi a `backend/src/apis/backup/backup.service.spec.ts`, dentro il blocco `describe('BackupService', ...)`:

```typescript
  it('restoreFromFile esegue mysql via spawn e scrive il contenuto del file su stdin', async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    fs.writeFileSync(sqlFile, 'INSERT INTO x VALUES (1);');

    const stdinChunks: Buffer[] = [];
    const fakeChild: any = new EventEmitter();
    fakeChild.stdin = {
      write: (chunk: Buffer) => {
        stdinChunks.push(chunk);
        return true;
      },
      end: jest.fn(),
    };
    fakeChild.stderr = new EventEmitter();
    (childProcess.spawn as unknown as jest.Mock).mockImplementation(() => {
      // il close arriva async, dopo che il chiamante ha già collegato gli handler
      setImmediate(() => fakeChild.emit('close', 0));
      return fakeChild;
    });

    await service.restoreFromFile(sqlFile);

    expect(childProcess.spawn).toHaveBeenCalledWith(
      'mysql',
      expect.arrayContaining(['--host=localhost', '--port=3306', '--user=root', 'mydatabase']),
      expect.objectContaining({ env: expect.objectContaining({ MYSQL_PWD: 'secret' }) }),
    );
    expect(Buffer.concat(stdinChunks).toString()).toBe('INSERT INTO x VALUES (1);');
    expect(fakeChild.stdin.end).toHaveBeenCalled();
  });

  it('restoreFromFile propaga l\'errore (stderr) se mysql termina con codice diverso da 0', async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    fs.writeFileSync(sqlFile, 'INSERT INTO x VALUES (1);');

    const fakeChild: any = new EventEmitter();
    fakeChild.stdin = { write: jest.fn(), end: jest.fn() };
    fakeChild.stderr = new EventEmitter();
    (childProcess.spawn as unknown as jest.Mock).mockImplementation(() => {
      setImmediate(() => {
        fakeChild.stderr.emit('data', Buffer.from('ERROR 1064: syntax error'));
        fakeChild.emit('close', 1);
      });
      return fakeChild;
    });

    await expect(service.restoreFromFile(sqlFile)).rejects.toThrow('ERROR 1064: syntax error');
  });
```

Nota implementativa: `child_process.execFile`/`exec` asincroni (a differenza delle varianti `*Sync`) NON supportano un'opzione `input` per scrivere su stdin — verrebbe ignorata silenziosamente e il comando `mysql` non riceverebbe mai il contenuto del backup. Per pipare lo stdin serve `child_process.spawn`, scrivendo esplicitamente su `child.stdin`. `spawn` con argomenti array (nessuna shell) rispetta comunque il vincolo di sicurezza del piano (mai stringa shell interpolata) — `mysqldump` (Task 4) resta invece su `execFile`, che va bene lì perché l'output passa da `--result-file`, non da stdin/stdout.

Aggiungi in cima a `backend/src/apis/backup/backup.service.spec.ts` l'import mancante:

```typescript
import { EventEmitter } from 'events';
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: FAIL — `service.restoreFromFile is not a function`

- [ ] **Step 3: Implementa `restoreFromFile` in `BackupService`**

Aggiungi in cima a `backend/src/apis/backup/backup.service.ts` l'import di `spawn` (accanto a quello già presente di `child_process`):

```typescript
import { spawn } from 'child_process';
```

Aggiungi a `backend/src/apis/backup/backup.service.ts`, dentro la classe `BackupService`, dopo `deleteBackup`:

```typescript
  async restoreFromFile(filePath: string): Promise<void> {
    const sqlContent = fs.readFileSync(filePath);

    const args = [
      `--host=${process.env.MYSQL_HOST}`,
      `--port=${process.env.MYSQL_PORT}`,
      `--user=${process.env.MYSQL_USER}`,
      process.env.MYSQL_DB as string,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('mysql', args, {
        env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD },
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Restore completato da: ${filePath}`);
          resolve();
        } else {
          const message = stderr.trim() || `mysql terminato con codice ${code}`;
          this.logger.error(`Restore fallito: ${message}`);
          reject(new Error(message));
        }
      });

      child.stdin.write(sqlContent);
      child.stdin.end();
    });
  }
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: PASS (7 test)

- [ ] **Step 5: Crea i DTO**

```typescript
// backend/src/apis/backup/dto/upload-chunk.dto.ts
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadChunkDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo chunkIndex deve essere un intero' })
  @Min(0, { message: 'Il campo chunkIndex deve essere >= 0' })
  chunkIndex: number;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;
}
```

```typescript
// backend/src/apis/backup/dto/restore-finalize.dto.ts
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RestoreFinalizeDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;

  @IsNotEmpty({ message: 'Il campo password è obbligatorio' })
  @IsString({ message: 'Il campo password deve essere una stringa' })
  password: string;
}
```

- [ ] **Step 6: Scrivi il test che fallisce per gli endpoint controller**

Aggiungi a `backend/src/apis/backup/backup.controller.spec.ts`. Sostituisci il blocco `beforeEach` con una versione che include anche `ChunkedUploadService` e `AuthService` mockati, poi aggiungi i nuovi test:

```typescript
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AuthService } from '@apis/auth/auth.service';
import { BadRequestException } from '@nestjs/common';

// ... dentro beforeEach, aggiungi ai providers:
        {
          provide: ChunkedUploadService,
          useValue: { saveChunk: jest.fn(), assemble: jest.fn() },
        },
        {
          provide: AuthService,
          useValue: { validateUser: jest.fn() },
        },
// ... e recupera le istanze mockate dopo compile():
    chunkedUpload = module.get(ChunkedUploadService);
    authService = module.get(AuthService);

// ... nuovi test, nello stesso describe:
  it('restoreChunk salva il chunk ricevuto', async () => {
    const file = { buffer: Buffer.from('data') } as Express.Multer.File;

    await controller.restoreChunk(file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 2 });

    expect(chunkedUpload.saveChunk).toHaveBeenCalledWith(
      'u1',
      0,
      2,
      file.buffer,
      expect.stringContaining('tmp'),
    );
  });

  it('restoreFinalize rifiuta password errata senza eseguire il restore', async () => {
    authService.validateUser.mockResolvedValue(null);

    await expect(
      controller.restoreFinalize(
        { uploadId: 'u1', totalChunks: 2, password: 'wrong' },
        { id: 1, email: 'admin@example.com', role: 'Admin' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(service.restoreFromFile).not.toHaveBeenCalled();
  });

  it('restoreFinalize assembla ed esegue il restore con password corretta', async () => {
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/restore.sql');
    service.restoreFromFile.mockResolvedValue(undefined);

    const result = await controller.restoreFinalize(
      { uploadId: 'u1', totalChunks: 2, password: 'correct' },
      { id: 1, email: 'admin@example.com', role: 'Admin' },
    );

    expect(authService.validateUser).toHaveBeenCalledWith('admin@example.com', 'correct');
    expect(service.restoreFromFile).toHaveBeenCalledWith('/tmp/restore.sql');
    expect(result).toEqual({ restored: true });
  });
```

Aggiungi anche `restoreFromFile: jest.fn()` all'oggetto mock di `BackupService` nel `beforeEach` esistente.

- [ ] **Step 7: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.controller --maxWorkers=2`
Expected: FAIL — `controller.restoreChunk is not a function`

- [ ] **Step 8: Implementa gli endpoint restore in `BackupController`**

Sostituisci l'intero contenuto di `backend/src/apis/backup/backup.controller.ts` con:

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { BackupService, BackupInfo } from './backup.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AuthService } from '@apis/auth/auth.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { UploadChunkDto } from './dto/upload-chunk.dto';
import { RestoreFinalizeDto } from './dto/restore-finalize.dto';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class BackupController {
  private readonly tmpDir = path.join(process.cwd(), 'backups', 'tmp');

  constructor(
    private readonly service: BackupService,
    private readonly chunkedUpload: ChunkedUploadService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  create(): Promise<BackupInfo> {
    return this.service.createBackup();
  }

  @Get()
  list(): Promise<BackupInfo[]> {
    return this.service.listBackups();
  }

  @Get(':filename/download')
  download(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response): StreamableFile {
    const filePath = this.service.getBackupPath(filename);
    res.set({
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string): Promise<void> {
    return this.service.deleteBackup(filename);
  }

  @Post('restore/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async restoreChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): Promise<{ received: boolean }> {
    this.chunkedUpload.saveChunk(dto.uploadId, dto.chunkIndex, dto.totalChunks, file.buffer, this.tmpDir);
    return { received: true };
  }

  @Post('restore/finalize')
  async restoreFinalize(
    @Body() dto: RestoreFinalizeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ restored: boolean }> {
    const validUser = await this.authService.validateUser(user.email, dto.password);
    if (!validUser) {
      throw new BadRequestException('Password non corretta');
    }

    const filePath = this.chunkedUpload.assemble(dto.uploadId, dto.totalChunks, this.tmpDir, `${dto.uploadId}.sql`);
    await this.service.restoreFromFile(filePath);
    fs.unlinkSync(filePath);

    return { restored: true };
  }
}
```

- [ ] **Step 9: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.controller --maxWorkers=2`
Expected: PASS (6 test)

- [ ] **Step 10: Commit**

```bash
git add backend/src/apis/backup
git commit -m "feat: aggiungi restore backup via upload a chunk con conferma password"
```

---

## Task 7: Cron backup automatico + retention

**Files:**
- Modify: `backend/src/apis/backup/backup.service.ts` (aggiunge cron + retention)
- Modify: `backend/src/apis/backup/backup.service.spec.ts` (aggiunge test)

**Interfaces:**
- Consumes: `createBackup()`, `listBackups()`, `deleteBackup()` (già nella stessa classe).
- Produces: `BackupService.applyRetention(retentionDays: number): Promise<{ deleted: string[] }>`, metodo schedulato `handleScheduledBackup()` decorato con `@Cron(process.env.BACKUP_CRON_SCHEDULE ?? CronExpression.EVERY_DAY_AT_MIDNIGHT)`.

- [ ] **Step 1: Scrivi il test che fallisce per `applyRetention`**

Aggiungi a `backend/src/apis/backup/backup.service.spec.ts`:

```typescript
  it('applyRetention cancella solo i backup più vecchi della retention', async () => {
    const oldFile = path.join(backupDir, 'utenzepa_20200101_000000.sql');
    const recentFile = path.join(backupDir, 'utenzepa_20260101_000000.sql');
    fs.writeFileSync(oldFile, 'old');
    fs.writeFileSync(recentFile, 'recent');
    fs.utimesSync(oldFile, new Date('2020-01-01'), new Date('2020-01-01'));
    fs.utimesSync(recentFile, new Date(), new Date());

    const result = await service.applyRetention(30);

    expect(result.deleted).toEqual(['utenzepa_20200101_000000.sql']);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: FAIL — `service.applyRetention is not a function`

- [ ] **Step 3: Implementa `applyRetention` e il cron**

Aggiungi in cima a `backend/src/apis/backup/backup.service.ts`:

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';
```

Aggiungi dentro la classe `BackupService`, dopo `restoreFromFile`:

```typescript
  async applyRetention(retentionDays: number): Promise<{ deleted: string[] }> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const backups = await this.listBackups();
    const deleted: string[] = [];

    for (const backup of backups) {
      if (backup.createdAt.getTime() < cutoff) {
        await this.deleteBackup(backup.filename);
        deleted.push(backup.filename);
      }
    }

    if (deleted.length > 0) {
      this.logger.log(`Retention: cancellati ${deleted.length} backup oltre ${retentionDays} giorni`);
    }
    return { deleted };
  }

  @Cron(process.env.BACKUP_CRON_SCHEDULE ?? CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledBackup(): Promise<void> {
    try {
      await this.createBackup();
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
      await this.applyRetention(retentionDays);
    } catch (err) {
      this.logger.error(`Backup schedulato fallito: ${(err as Error).message}`);
    }
  }
```

Nota: `createdAt` in `listBackups()` usa `stat.birthtime` — su alcuni filesystem Linux `birthtime` può non essere supportato e ricadere su `ctime`; per il caso d'uso (retention su backup creati da questo stesso servizio, mai modificati dopo la creazione) è equivalente e sufficiente.

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/backup/backup.service --maxWorkers=2`
Expected: PASS (8 test)

- [ ] **Step 5: Verifica build**

Run: `docker exec utenzepa-api-1 npm run build`
Expected: nessun errore (verifica che `ScheduleModule.forRoot()` sia già registrato in `app.module.ts` — lo è, riga 37).

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/backup/backup.service.ts backend/src/apis/backup/backup.service.spec.ts
git commit -m "feat: aggiungi backup schedulato via cron con retention configurabile"
```

---

## Task 8: `DataImporterService` — parametro `filePath` opzionale

**Files:**
- Modify: `backend/src/data-importer/data-importer.service.ts` (tutti e 9 i metodi `importXxx`)
- Test: `backend/src/data-importer/data-importer.service.spec.ts` (nuovo — il file non esiste oggi)

**Interfaces:**
- Produces: ogni metodo `importXxx(filePath?: string)` — se `filePath` non è passato, usa lo stesso path fisso di oggi (nessuna modifica di comportamento per `DataImporterController`, che continua a chiamarli senza argomenti).

Questo task modifica un file esistente di ~830 righe con una singola modifica meccanica ripetuta 9 volte: cambiare la riga `const filePath = path.join(process.cwd(), 'src', 'data-importer', 'source', '<file>.csv');` in modo che accetti un parametro opzionale con lo stesso default. Il diff è identico nella forma per tutti e 9 i metodi — viene mostrato per intero per ciascuno, la logica di test è scritta per intero solo su un metodo rappresentativo (`importUtilizers`, il più semplice) più un test che verifica che tutti gli altri firmano `filePath?: string` (stesso pattern, stesso tipo).

- [ ] **Step 1: Scrivi il test che fallisce**

```typescript
// backend/src/data-importer/data-importer.service.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataImporterService } from './data-importer.service';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
import { UtilityAggregator } from '@apis/utility-aggregators/entity/utility-aggregator.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Supplier } from '@apis/shared/entities/supplier.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { CostsBorneBy } from '@apis/shared/entities/utility_cost_borne_by.entity';
import { MaintenanceManager } from '@apis/shared/entities/maintenanceManagers.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';

const mockRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
});

describe('DataImporterService', () => {
  let service: DataImporterService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-importer-test-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImporterService,
        { provide: getRepositoryToken(Utilizer), useFactory: mockRepo },
        { provide: getRepositoryToken(Asset), useFactory: mockRepo },
        { provide: getRepositoryToken(AssetAggregator), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilityAggregator), useFactory: mockRepo },
        { provide: getRepositoryToken(BudgetChapter), useFactory: mockRepo },
        { provide: getRepositoryToken(Supplier), useFactory: mockRepo },
        { provide: getRepositoryToken(Utility), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilityType), useFactory: mockRepo },
        { provide: getRepositoryToken(CostsBorneBy), useFactory: mockRepo },
        { provide: getRepositoryToken(MaintenanceManager), useFactory: mockRepo },
        { provide: getRepositoryToken(ConsipAgreement), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilizerGrant), useFactory: mockRepo },
        { provide: getRepositoryToken(Invoice), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(DataImporterService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('importUtilizers usa il path custom quando fornito', async () => {
    const customPath = path.join(tmpDir, 'custom.csv');
    fs.writeFileSync(customPath, 'utilizzatore\nMario Rossi\n', { encoding: 'latin1' });

    const result = await service.importUtilizers(customPath);

    expect(result).toEqual({ imported: 1, skipped: 0 });
  });

  it('importUtilizers lancia se il path custom non esiste', async () => {
    const missingPath = path.join(tmpDir, 'missing.csv');

    await expect(service.importUtilizers(missingPath)).rejects.toThrow('File non trovato');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest data-importer/data-importer.service --maxWorkers=2`
Expected: FAIL — `Expected 0 arguments, but got 1` (errore TS) oppure test rosso a runtime se TS non blocca.

- [ ] **Step 3: Modifica i 9 metodi per accettare `filePath?: string`**

In `backend/src/data-importer/data-importer.service.ts`, per ciascuno dei 9 metodi pubblici `importXxx`, la modifica è identica nella forma. Esempio per `importAssets` (riga 132-133 del file attuale):

Prima:
```typescript
  async importAssets(): Promise<{ imported: number; skipped: number }> {
    const filePath = path.join(process.cwd(), 'src', 'data-importer', 'source', 'immobili.csv');
```

Dopo:
```typescript
  async importAssets(
    filePath: string = path.join(process.cwd(), 'src', 'data-importer', 'source', 'immobili.csv'),
  ): Promise<{ imported: number; skipped: number }> {
```

Applica lo stesso pattern (firma con default = path fisso attuale, corpo del metodo invariato) a:

- `importAssetAggregators()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'aggregati_immobili.csv')`
- `importUtilityAggregators()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'aggregati_utenze.csv')`
- `importBudgetChapters()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'capitoli_di_spesa.csv')`
- `importSuppliers()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'fornitori.csv')`
- `importUtilities()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'utenze.csv')`
- `importUtilizerGrants()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'utilzzatori.csv')` — attenzione: il codice attuale usa `'utilizzatori.csv'` per QUESTO metodo (stesso file di `importUtilizers`), mantieni il valore esatto già presente in `data-importer.service.ts:609`.
- `importInvoices()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'fatture.csv')`
- `importUtilizers()` → default `path.join(process.cwd(), 'src', 'data-importer', 'source', 'utilizzatori.csv')`

Per ognuno, elimina la vecchia riga `const filePath = ...` e sposta lo stesso valore come default del parametro, lasciando invariato tutto il resto del corpo del metodo (che già usa la variabile locale `filePath`).

`importAll()` non cambia — continua a chiamare i metodi senza argomenti.

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest data-importer --maxWorkers=2`
Expected: PASS (2 nuovi test + nessuna regressione — il modulo non aveva test propri prima).

- [ ] **Step 5: Verifica che il vecchio endpoint non sia stato toccato nel comportamento**

Run: `docker exec utenzepa-api-1 npm run type-check`
Expected: nessun errore — `DataImporterController` chiama i metodi senza argomenti, resta compatibile col parametro opzionale.

- [ ] **Step 6: Commit**

```bash
git add backend/src/data-importer
git commit -m "refactor: rendi opzionale il filePath nei metodi di DataImporterService

Nessuna modifica di comportamento per il vecchio endpoint importer/* —
prepara il riuso della logica di parsing dal nuovo modulo apis/import."
```

---

## Task 9: `entity-type.enum.ts` + `ImportService`

**Files:**
- Create: `backend/src/apis/import/entity-type.enum.ts`
- Create: `backend/src/apis/import/import.service.ts`
- Test: `backend/src/apis/import/import.service.spec.ts`

**Interfaces:**
- Consumes: `DataImporterService` (Task 8) — tutti e 9 i metodi `importXxx(filePath?: string)`.
- Produces:
  - `enum ImportEntityType { ASSETS = 'immobili', ASSET_AGGREGATORS = 'aggregati-immobili', UTILITY_AGGREGATORS = 'aggregati-utenze', BUDGET_CHAPTERS = 'capitoli-di-spesa', SUPPLIERS = 'fornitori', UTILIZERS = 'utilizzatori', UTILIZER_GRANTS = 'concessioni', UTILITIES = 'utenze', INVOICES = 'fatture' }`
  - `class ImportService` — `importFromFile(entityType: ImportEntityType, filePath: string): Promise<Record<string, unknown>>`

- [ ] **Step 1: Crea l'enum**

```typescript
// backend/src/apis/import/entity-type.enum.ts
export enum ImportEntityType {
  ASSETS = 'immobili',
  ASSET_AGGREGATORS = 'aggregati-immobili',
  UTILITY_AGGREGATORS = 'aggregati-utenze',
  BUDGET_CHAPTERS = 'capitoli-di-spesa',
  SUPPLIERS = 'fornitori',
  UTILIZERS = 'utilizzatori',
  UTILIZER_GRANTS = 'concessioni',
  UTILITIES = 'utenze',
  INVOICES = 'fatture',
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

```typescript
// backend/src/apis/import/import.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { ImportEntityType } from './entity-type.enum';

describe('ImportService', () => {
  let service: ImportService;
  let dataImporter: jest.Mocked<DataImporterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        {
          provide: DataImporterService,
          useValue: {
            importAssets: jest.fn(),
            importAssetAggregators: jest.fn(),
            importUtilityAggregators: jest.fn(),
            importBudgetChapters: jest.fn(),
            importSuppliers: jest.fn(),
            importUtilizers: jest.fn(),
            importUtilizerGrants: jest.fn(),
            importUtilities: jest.fn(),
            importInvoices: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ImportService);
    dataImporter = module.get(DataImporterService);
  });

  it('importFromFile per ASSETS delega a dataImporter.importAssets con il path fornito', async () => {
    dataImporter.importAssets.mockResolvedValue({ imported: 5, skipped: 1 });

    const result = await service.importFromFile(ImportEntityType.ASSETS, '/tmp/file.csv');

    expect(dataImporter.importAssets).toHaveBeenCalledWith('/tmp/file.csv');
    expect(result).toEqual({ imported: 5, skipped: 1 });
  });

  it('importFromFile per INVOICES delega a dataImporter.importInvoices', async () => {
    dataImporter.importInvoices.mockResolvedValue({ imported: 2, skipped: 0, skippedRows: [] });

    const result = await service.importFromFile(ImportEntityType.INVOICES, '/tmp/fatture.csv');

    expect(dataImporter.importInvoices).toHaveBeenCalledWith('/tmp/fatture.csv');
    expect(result).toEqual({ imported: 2, skipped: 0, skippedRows: [] });
  });

  it('importFromFile lancia per un entityType non mappato', async () => {
    await expect(
      service.importFromFile('non-esistente' as ImportEntityType, '/tmp/file.csv'),
    ).rejects.toThrow('Tipo entità non supportato');
  });
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/import/import.service --maxWorkers=2`
Expected: FAIL — `Cannot find module './import.service'`

- [ ] **Step 4: Implementa `ImportService`**

```typescript
// backend/src/apis/import/import.service.ts
import { Injectable } from '@nestjs/common';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { ImportEntityType } from './entity-type.enum';

@Injectable()
export class ImportService {
  constructor(private readonly dataImporter: DataImporterService) {}

  async importFromFile(entityType: ImportEntityType, filePath: string): Promise<Record<string, unknown>> {
    switch (entityType) {
      case ImportEntityType.ASSETS:
        return this.dataImporter.importAssets(filePath);
      case ImportEntityType.ASSET_AGGREGATORS:
        return this.dataImporter.importAssetAggregators(filePath);
      case ImportEntityType.UTILITY_AGGREGATORS:
        return this.dataImporter.importUtilityAggregators(filePath);
      case ImportEntityType.BUDGET_CHAPTERS:
        return this.dataImporter.importBudgetChapters(filePath);
      case ImportEntityType.SUPPLIERS:
        return this.dataImporter.importSuppliers(filePath);
      case ImportEntityType.UTILIZERS:
        return this.dataImporter.importUtilizers(filePath);
      case ImportEntityType.UTILIZER_GRANTS:
        return this.dataImporter.importUtilizerGrants(filePath);
      case ImportEntityType.UTILITIES:
        return this.dataImporter.importUtilities(filePath);
      case ImportEntityType.INVOICES:
        return this.dataImporter.importInvoices(filePath);
      default:
        throw new Error('Tipo entità non supportato');
    }
  }
}
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/import/import.service --maxWorkers=2`
Expected: PASS (3 test)

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/import/entity-type.enum.ts backend/src/apis/import/import.service.ts backend/src/apis/import/import.service.spec.ts
git commit -m "feat: aggiungi ImportService che delega a DataImporterService con path custom"
```

---

## Task 10: `ImportController` + `ImportModule`

**Files:**
- Create: `backend/src/apis/import/import.controller.ts`
- Test: `backend/src/apis/import/import.controller.spec.ts`
- Create: `backend/src/apis/import/import.module.ts`
- Create: `backend/src/apis/import/dto/import-finalize.dto.ts`
- Modify: `backend/src/app.module.ts` (registra `ImportModule`)

**Interfaces:**
- Consumes: `ImportService` (Task 9), `ChunkedUploadService` (Task 3), `ImportEntityType` (Task 9), `UploadChunkDto` (Task 6, riusato).
- Produces:
  - `POST /api/v1/import/:entityType/chunk` (multipart: campo file `chunk` + body `uploadId`, `chunkIndex`, `totalChunks`) → `{ received: true }`
  - `POST /api/v1/import/:entityType/finalize` (body `{ uploadId, totalChunks }`) → risultato di `ImportService.importFromFile` (`{ imported, skipped, skippedRows? }`)

- [ ] **Step 1: Crea il DTO finalize**

```typescript
// backend/src/apis/import/dto/import-finalize.dto.ts
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportFinalizeDto {
  @IsNotEmpty({ message: 'Il campo uploadId è obbligatorio' })
  @IsString({ message: 'Il campo uploadId deve essere una stringa' })
  uploadId: string;

  @Type(() => Number)
  @IsInt({ message: 'Il campo totalChunks deve essere un intero' })
  @Min(1, { message: 'Il campo totalChunks deve essere >= 1' })
  totalChunks: number;
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

```typescript
// backend/src/apis/import/import.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { ImportEntityType } from './entity-type.enum';

describe('ImportController', () => {
  let controller: ImportController;
  let importService: jest.Mocked<ImportService>;
  let chunkedUpload: jest.Mocked<ChunkedUploadService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: { importFromFile: jest.fn() } },
        { provide: ChunkedUploadService, useValue: { saveChunk: jest.fn(), assemble: jest.fn() } },
      ],
    }).compile();

    controller = module.get(ImportController);
    importService = module.get(ImportService);
    chunkedUpload = module.get(ChunkedUploadService);
  });

  it('chunk rifiuta un entityType non valido', async () => {
    const file = { buffer: Buffer.from('a') } as Express.Multer.File;

    await expect(
      controller.chunk('non-valido', file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('chunk salva il chunk per un entityType valido', async () => {
    const file = { buffer: Buffer.from('a') } as Express.Multer.File;

    await controller.chunk('immobili', file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 1 });

    expect(chunkedUpload.saveChunk).toHaveBeenCalledWith('u1', 0, 1, file.buffer, expect.stringContaining('tmp'));
  });

  it('finalize assembla ed esegue l\'import', async () => {
    chunkedUpload.assemble.mockReturnValue('/tmp/u1.csv');
    importService.importFromFile.mockResolvedValue({ imported: 3, skipped: 0 });

    const result = await controller.finalize('immobili', { uploadId: 'u1', totalChunks: 1 });

    expect(importService.importFromFile).toHaveBeenCalledWith(ImportEntityType.ASSETS, '/tmp/u1.csv');
    expect(result).toEqual({ imported: 3, skipped: 0 });
  });
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisca**

Run: `docker exec utenzepa-api-1 npx jest apis/import/import.controller --maxWorkers=2`
Expected: FAIL — `Cannot find module './import.controller'`

- [ ] **Step 4: Implementa `ImportController`**

```typescript
// backend/src/apis/import/import.controller.ts
import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { ImportService } from './import.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { ImportEntityType } from './entity-type.enum';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { UploadChunkDto } from '@apis/backup/dto/upload-chunk.dto';
import { ImportFinalizeDto } from './dto/import-finalize.dto';

@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class ImportController {
  private readonly tmpDir = path.join(process.cwd(), 'import-tmp');

  constructor(
    private readonly importService: ImportService,
    private readonly chunkedUpload: ChunkedUploadService,
  ) {}

  private resolveEntityType(entityType: string): ImportEntityType {
    const valid = Object.values(ImportEntityType) as string[];
    if (!valid.includes(entityType)) {
      throw new BadRequestException(`Tipo entità non valido: ${entityType}`);
    }
    return entityType as ImportEntityType;
  }

  @Post(':entityType/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async chunk(
    @Param('entityType') entityType: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): Promise<{ received: boolean }> {
    this.resolveEntityType(entityType);
    this.chunkedUpload.saveChunk(dto.uploadId, dto.chunkIndex, dto.totalChunks, file.buffer, this.tmpDir);
    return { received: true };
  }

  @Post(':entityType/finalize')
  async finalize(
    @Param('entityType') entityType: string,
    @Body() dto: ImportFinalizeDto,
  ): Promise<Record<string, unknown>> {
    const type = this.resolveEntityType(entityType);
    const filePath = this.chunkedUpload.assemble(dto.uploadId, dto.totalChunks, this.tmpDir, `${dto.uploadId}.csv`);
    return this.importService.importFromFile(type, filePath);
  }
}
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `docker exec utenzepa-api-1 npx jest apis/import/import.controller --maxWorkers=2`
Expected: PASS (3 test)

- [ ] **Step 6: Crea `ImportModule`**

```typescript
// backend/src/apis/import/import.module.ts
import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { DataImporterModule } from '@/data-importer/data-importer.module';

@Module({
  imports: [ChunkedUploadModule, DataImporterModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
```

- [ ] **Step 7: Registra `ImportModule` in `app.module.ts`**

In `backend/src/app.module.ts`, aggiungi l'import:

```typescript
import { ImportModule } from '@apis/import/import.module';
```

E aggiungi `ImportModule,` all'array `imports`, dopo `BackupModule,`.

- [ ] **Step 8: Verifica che l'app si avvii**

Run: `docker exec utenzepa-api-1 npm run build`
Expected: build senza errori.

- [ ] **Step 9: Esegui l'intera suite backend per verificare nessuna regressione**

Run: `docker exec utenzepa-api-1 npm run test -- --maxWorkers=2`
Expected: PASS su tutti i test (esistenti + nuovi).

- [ ] **Step 10: Commit**

```bash
git add backend/src/apis/import backend/src/app.module.ts
git commit -m "feat: aggiungi ImportController con upload a chunk per import CSV da UI"
```

---

## Task 11: Frontend — `chunked-upload.service.ts` condiviso

**Files:**
- Create: `frontend/src/app/services/chunked-upload.service.ts`

**Interfaces:**
- Consumes: `HttpClient` (Angular), `AuthService.getToken()` (esistente, `frontend/src/app/services/auth.service.ts`).
- Produces:
  - `class ChunkedUploadService`
  - `uploadFile(file: File, chunkEndpointUrl: string, finalizeEndpointUrl: string, finalizeExtraBody?: Record<string, any>): Observable<any>` — spezza il file in chunk da 1MB, li invia in sequenza a `chunkEndpointUrl` (`POST`, multipart con campo `chunk` + `uploadId`/`chunkIndex`/`totalChunks`), poi chiama `finalizeEndpointUrl` con `POST` (`uploadId`, `totalChunks`, più eventuali campi extra) e ritorna la risposta del finalize.

- [ ] **Step 1: Implementa `ChunkedUploadService`**

```typescript
// frontend/src/app/services/chunked-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, concatMap, toArray, switchMap } from 'rxjs';
import { AuthService } from './auth.service';

const CHUNK_SIZE = 1024 * 1024; // 1MB, vincolo reverse proxy di produzione

@Injectable({ providedIn: 'root' })
export class ChunkedUploadService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token || ''}` });
  }

  private generateUploadId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  uploadFile(
    file: File,
    chunkEndpointUrl: string,
    finalizeEndpointUrl: string,
    finalizeExtraBody: Record<string, any> = {},
  ): Observable<any> {
    const uploadId = this.generateUploadId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunkIndexes = Array.from({ length: totalChunks }, (_, i) => i);

    return from(chunkIndexes).pipe(
      concatMap((chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', blob);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));

        return this.http.post(chunkEndpointUrl, formData, { headers: this.getAuthHeaders() });
      }),
      toArray(),
      switchMap(() =>
        this.http.post(
          finalizeEndpointUrl,
          { uploadId, totalChunks, ...finalizeExtraBody },
          { headers: this.getAuthHeaders() },
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verifica build frontend**

Run: `docker exec utenzepa-frontend-1 npm run build` (oppure, se il container dev non ha lo script `build` in watch, esegui `ng build` dentro il container con lo stesso comando usato da CI)
Expected: build senza errori TypeScript.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/services/chunked-upload.service.ts
git commit -m "feat(frontend): aggiungi ChunkedUploadService condiviso per upload a chunk da 1MB"
```

---

## Task 12: Frontend — `backup.service.ts` e `import.service.ts`

**Files:**
- Create: `frontend/src/app/pages/backup-import/backup.service.ts`
- Create: `frontend/src/app/pages/backup-import/import.service.ts`

**Interfaces:**
- Consumes: `HttpClient`, `AuthService`, `environment.apiUrl` (`frontend/src/environments/environment.ts`), `ChunkedUploadService` (Task 11).
- Produces:
  - `class BackupService` — `list(): Observable<BackupInfo[]>`, `create(): Observable<BackupInfo>`, `remove(filename: string): Observable<void>`, `downloadUrl(filename: string): string`, `restore(file: File, password: string): Observable<any>`
  - `interface BackupInfo { filename: string; size: number; createdAt: string }`
  - `class ImportService` — `import(entityType: string, file: File): Observable<any>`

- [ ] **Step 1: Implementa `BackupService`**

```typescript
// frontend/src/app/pages/backup-import/backup.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { ChunkedUploadService } from '../../services/chunked-upload.service';

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private chunkedUpload = inject(ChunkedUploadService);
  private readonly BASE_URL = environment.apiUrl + '/backup';

  private getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token || ''}` });
  }

  list(): Observable<BackupInfo[]> {
    return this.http.get<BackupInfo[]>(this.BASE_URL, { headers: this.getAuthHeaders() });
  }

  create(): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(this.BASE_URL, {}, { headers: this.getAuthHeaders() });
  }

  remove(filename: string): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/${filename}`, { headers: this.getAuthHeaders() });
  }

  downloadUrl(filename: string): string {
    return `${this.BASE_URL}/${filename}/download`;
  }

  restore(file: File, password: string): Observable<any> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/restore/chunk`,
      `${this.BASE_URL}/restore/finalize`,
      { password },
    );
  }
}
```

- [ ] **Step 2: Implementa `ImportService`**

```typescript
// frontend/src/app/pages/backup-import/import.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChunkedUploadService } from '../../services/chunked-upload.service';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private chunkedUpload = inject(ChunkedUploadService);
  private readonly BASE_URL = environment.apiUrl + '/import';

  import(entityType: string, file: File): Observable<any> {
    return this.chunkedUpload.uploadFile(
      file,
      `${this.BASE_URL}/${entityType}/chunk`,
      `${this.BASE_URL}/${entityType}/finalize`,
    );
  }
}
```

- [ ] **Step 3: Verifica build frontend**

Run: build container frontend (stesso comando del Task 11, Step 2).
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/backup-import/backup.service.ts frontend/src/app/pages/backup-import/import.service.ts
git commit -m "feat(frontend): aggiungi BackupService e ImportService"
```

---

## Task 13: Frontend — pagina `backup-import` (componente + template)

**Files:**
- Create: `frontend/src/app/pages/backup-import/backup-import.component.ts`
- Create: `frontend/src/app/pages/backup-import/backup-import.component.html`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`

**Interfaces:**
- Consumes: `BackupService`, `ImportService` (Task 12).

- [ ] **Step 1: Implementa il componente**

```typescript
// frontend/src/app/pages/backup-import/backup-import.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { BackupService, BackupInfo } from './backup.service';
import { ImportService } from './import.service';

interface EntityTypeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-backup-import',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    TabViewModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    DialogModule,
    ToastModule,
  ],
  templateUrl: './backup-import.component.html',
})
export class BackupImportComponent {
  private backupService = inject(BackupService);
  private importService = inject(ImportService);
  private messageService = inject(MessageService);

  backups: BackupInfo[] = [];
  loadingBackups = false;
  creatingBackup = false;

  restoreFile: File | null = null;
  restoreDialogVisible = false;
  restorePassword = '';
  restoring = false;

  entityTypes: EntityTypeOption[] = [
    { label: 'Immobili', value: 'immobili' },
    { label: 'Aggregati immobili', value: 'aggregati-immobili' },
    { label: 'Aggregati utenze', value: 'aggregati-utenze' },
    { label: 'Capitoli di spesa', value: 'capitoli-di-spesa' },
    { label: 'Fornitori', value: 'fornitori' },
    { label: 'Utilizzatori', value: 'utilizzatori' },
    { label: 'Concessioni', value: 'concessioni' },
    { label: 'Utenze', value: 'utenze' },
    { label: 'Fatture', value: 'fatture' },
  ];
  selectedEntityType: string | null = null;
  importFile: File | null = null;
  importing = false;
  importResult: Record<string, unknown> | null = null;

  ngOnInit() {
    this.loadBackups();
  }

  loadBackups() {
    this.loadingBackups = true;
    this.backupService.list().subscribe({
      next: (list) => {
        this.backups = list;
        this.loadingBackups = false;
      },
      error: () => {
        this.loadingBackups = false;
        this.messageService.add({ severity: 'error', summary: 'Errore nel caricamento dei backup' });
      },
    });
  }

  createBackup() {
    this.creatingBackup = true;
    this.backupService.create().subscribe({
      next: () => {
        this.creatingBackup = false;
        this.messageService.add({ severity: 'success', summary: 'Backup creato' });
        this.loadBackups();
      },
      error: () => {
        this.creatingBackup = false;
        this.messageService.add({ severity: 'error', summary: 'Errore nella creazione del backup' });
      },
    });
  }

  deleteBackup(filename: string) {
    this.backupService.remove(filename).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Backup eliminato' });
        this.loadBackups();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Errore nella cancellazione del backup' });
      },
    });
  }

  downloadUrl(filename: string): string {
    return this.backupService.downloadUrl(filename);
  }

  onRestoreFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.restoreFile = input.files?.[0] ?? null;
    if (this.restoreFile) {
      this.restoreDialogVisible = true;
    }
  }

  confirmRestore() {
    if (!this.restoreFile || !this.restorePassword) return;

    this.restoring = true;
    this.backupService.restore(this.restoreFile, this.restorePassword).subscribe({
      next: () => {
        this.restoring = false;
        this.restoreDialogVisible = false;
        this.restorePassword = '';
        this.restoreFile = null;
        this.messageService.add({ severity: 'success', summary: 'Ripristino completato' });
        this.loadBackups();
      },
      error: (err: any) => {
        this.restoring = false;
        const detail = err?.error?.message ?? 'Errore nel ripristino';
        this.messageService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }

  cancelRestore() {
    this.restoreDialogVisible = false;
    this.restorePassword = '';
    this.restoreFile = null;
  }

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.importFile = input.files?.[0] ?? null;
  }

  runImport() {
    if (!this.selectedEntityType || !this.importFile) return;

    this.importing = true;
    this.importResult = null;
    this.importService.import(this.selectedEntityType, this.importFile).subscribe({
      next: (result) => {
        this.importing = false;
        this.importResult = result;
        this.messageService.add({ severity: 'success', summary: 'Import completato' });
      },
      error: (err: any) => {
        this.importing = false;
        const detail = err?.error?.message ?? 'Errore nell\'import';
        this.messageService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }
}
```

- [ ] **Step 2: Implementa il template**

```html
<!-- frontend/src/app/pages/backup-import/backup-import.component.html -->
<p-toast key="global"></p-toast>

<h2>Backup e Importazione</h2>

<p-tabView>
  <p-tabPanel header="Backup">
    <div class="mb-3">
      <p-button label="Crea backup ora" [loading]="creatingBackup" (onClick)="createBackup()"></p-button>
    </div>

    <p-table [value]="backups" [loading]="loadingBackups">
      <ng-template pTemplate="header">
        <tr>
          <th>Nome file</th>
          <th>Dimensione (byte)</th>
          <th>Data creazione</th>
          <th>Azioni</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-backup>
        <tr>
          <td>{{ backup.filename }}</td>
          <td>{{ backup.size }}</td>
          <td>{{ backup.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
          <td>
            <a [href]="downloadUrl(backup.filename)" target="_blank">Scarica</a>
            <p-button label="Elimina" severity="danger" [text]="true" (onClick)="deleteBackup(backup.filename)"></p-button>
          </td>
        </tr>
      </ng-template>
    </p-table>

    <div class="mt-4">
      <h3>Ripristina da backup</h3>
      <p class="text-red-600">Attenzione: il ripristino sovrascrive tutti i dati attuali. Azione irreversibile.</p>
      <input type="file" accept=".sql" (change)="onRestoreFileSelected($event)" />
    </div>

    <p-dialog header="Conferma ripristino" [(visible)]="restoreDialogVisible" [modal]="true">
      <p>
        Stai per sovrascrivere TUTTI i dati attuali con il contenuto del file
        <strong>{{ restoreFile?.name }}</strong>. Questa azione è irreversibile.
      </p>
      <p>Inserisci la tua password per confermare:</p>
      <p-password [(ngModel)]="restorePassword" [feedback]="false" [toggleMask]="true"></p-password>
      <div class="mt-3">
        <p-button label="Annulla" severity="secondary" (onClick)="cancelRestore()"></p-button>
        <p-button
          label="Conferma ripristino"
          severity="danger"
          [loading]="restoring"
          [disabled]="!restorePassword"
          (onClick)="confirmRestore()"
        ></p-button>
      </div>
    </p-dialog>
  </p-tabPanel>

  <p-tabPanel header="Importa dati">
    <div class="flex flex-column gap-3">
      <p-select
        [options]="entityTypes"
        [(ngModel)]="selectedEntityType"
        optionLabel="label"
        optionValue="value"
        placeholder="Seleziona il tipo di dati da importare"
      ></p-select>

      <input type="file" accept=".csv" (change)="onImportFileSelected($event)" />

      <p-button
        label="Importa"
        [loading]="importing"
        [disabled]="!selectedEntityType || !importFile"
        (onClick)="runImport()"
      ></p-button>

      <div *ngIf="importResult">
        <h4>Risultato import</h4>
        <p>Importati: {{ importResult['imported'] }}</p>
        <p>Saltati: {{ importResult['skipped'] }}</p>
      </div>
    </div>
  </p-tabPanel>
</p-tabView>
```

- [ ] **Step 3: Aggiungi la route**

In `frontend/src/app/app.routes.ts`, importa il componente in cima al file:

```typescript
import { BackupImportComponent } from './pages/backup-import/backup-import.component';
```

Poi aggiungi la route dentro il blocco protetto da `AuthGuard` (stesso blocco che contiene `{path: 'system-users', component: SystemUsersComponent}`):

```typescript
      {path: 'backup-import', component: BackupImportComponent},
```

- [ ] **Step 4: Aggiungi la voce di menu**

In `frontend/src/app/comp/sidebar/sidebar.component.ts`, nell'array `menu`, dentro il `submenu` di `'Impostazioni'` (dopo `{label: 'Utilizzatori', ...}`, riga 49), aggiungi:

```typescript
        {label: 'Backup e Importazione', icon: 'pi pi-database', route: '/backup-import'},
```

- [ ] **Step 5: Verifica manuale in browser**

Run: `docker compose up -d` (assicurati che l'override di sviluppo sia attivo), poi apri `http://localhost:4300`, effettua login come utente `Admin`, naviga su Impostazioni → Backup e Importazione. Verifica:
- la tabella backup si carica (anche vuota);
- "Crea backup ora" produce un nuovo backup nella lista (richiede `mysqldump` funzionante nel container `api` — verificato dal Task 1);
- il download del backup funziona;
- il tab "Importa dati" permette di selezionare un'entità, caricare un CSV di test e mostra il risultato.

Non è richiesta l'esecuzione di un vero restore in questa verifica manuale (distruttivo) — verificare solo che il flusso arrivi fino al modal di conferma password.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/backup-import frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(frontend): aggiungi pagina Backup e Importazione con tab backup/restore e import CSV"
```

---

## Self-Review (eseguita durante la stesura del piano)

**Copertura spec:**
- Backup manuale + schedulato + retention → Task 4, 5, 7. ✓
- Restore con chunk upload + conferma password → Task 6. ✓
- Import CSV da UI, 9 entità, affiancato al vecchio importer → Task 8, 9, 10. ✓
- Chunk da 1MB (vincolo proxy prod) → Task 3 (backend), 11 (frontend), riusato da Task 6 e 10. ✓
- Sicurezza (execFile, path traversal, MYSQL_PWD) → Task 4, 6. ✓
- Admin-only → Task 5, 6, 10 (`@Roles('Admin')`). ✓
- Frontend con voce menu sotto Impostazioni → Task 13. ✓
- Docker/env (mysql-client, volume, env vars) → Task 1. ✓
- Testing (backup.service, chunked-upload, import parsers) → Task 3, 4, 6, 7, 8, 9, 10. ✓

**Placeholder scan:** nessun "TBD"/"implementare dopo" rimasto — l'unica ripetizione dichiarata esplicitamente (Task 8, i 9 metodi `importXxx`) mostra comunque il valore esatto del default per ciascun metodo, non è un placeholder.

**Coerenza tipi:** `BackupInfo` (backend `backup.service.ts` e frontend `backup.service.ts`) hanno la stessa forma (`filename`, `size`, `createdAt`) — differiscono solo nel tipo di `createdAt` (`Date` lato backend, serializzato a stringa ISO in JSON, letto come `string` lato frontend — corretto, coerente con il resto del progetto che non usa un serializer custom per le date). `ImportEntityType` values (kebab-case italiano) coerenti tra `entity-type.enum.ts` (backend) e le option `value` nel componente frontend (Task 13).

---

## Note per l'esecuzione

- I Task 1-10 sono backend, sequenziali (Task 6 dipende da Task 3+5, Task 9 dipende da Task 8, Task 10 dipende da Task 3+9).
- I Task 11-13 sono frontend, sequenziali, dipendono dal completamento dei Task 3-10 (endpoint backend devono esistere per la verifica manuale del Task 13).
- Nessun task richiede modifiche a `docs/superpowers/specs/2026-08-05-backup-import-ui-design.md`.
