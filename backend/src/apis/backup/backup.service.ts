import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import { createConnection, RowDataPacket } from 'mysql2/promise';
import { maintenance } from '@common/maintenance/maintenance';

// Due formati: ".sql" (solo dump, sempre) e ".tar.gz" (dump.sql + foto,
// solo backup manuali — vedi createBackup). Entrambi coesistono nella
// stessa cartella/lista: i backup .sql creati prima di questa feature
// restano validi e ripristinabili (solo senza foto, ovviamente).
// Il segmento versione (`_<tag>`, es. "_v1.0.7") è opzionale nel pattern
// per lo stesso motivo: i backup creati prima di questa feature non ce
// l'hanno.
const FILENAME_PATTERN = /^utenzepa_\d{8}_\d{6}(?:_[A-Za-z0-9._-]+)?\.(sql|tar\.gz)$/;
const FILENAME_DATE_PATTERN =
  /^utenzepa_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_[A-Za-z0-9._-]+)?\.(?:sql|tar\.gz)$/;

function escapeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) {
    return `'${v
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '')}'`;
  }
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  // Colonne JSON (es. invoice_patterns.rules): mysql2 le restituisce già come oggetto.
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0')}'`;
}

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
}

// Creazione e ripristino girano in background: con foto e allegati durano
// minuti e una richiesta HTTP così lunga verrebbe chiusa dal proxy. La pagina
// Backup interroga questo stato; durante il ripristino l'app è in
// manutenzione (vedi common/maintenance).
export interface BackupJobStatus {
  creating: { startedAt: Date } | null;
  lastCreate: { finishedAt: Date; filename?: string; error?: string } | null;
  restoring: { startedAt: Date } | null;
  lastRestore: { finishedAt: Date; error?: string } | null;
}

const DOWNLOAD_TICKET_TTL_MS = 60 * 1000;

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  readonly backupDir: string;
  private readonly jobs: BackupJobStatus = {
    creating: null,
    lastCreate: null,
    restoring: null,
    lastRestore: null,
  };
  // Download via link monouso: un backup da GB scaricato con HttpClient
  // finirebbe tutto nella memoria del browser.
  private readonly downloadTickets = new Map<string, { filename: string; expiresAt: number }>();

  constructor() {
    this.backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  private dbConfig() {
    return {
      host: process.env.MYSQL_HOST ?? 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DB ?? 'mydatabase',
    };
  }

  // Stessa risoluzione di HealthService.getVersion() (APP_VERSION dalla CI
  // per build da tag, altrimenti VCS_REF/commit, altrimenti 'dev') — un
  // backup porta nel nome la versione dell'app che l'ha generato, utile per
  // sapere a colpo d'occhio con quale release è stato creato.
  private resolveVersion(): string {
    const version = process.env['APP_VERSION'];
    if (version && version !== 'dev') return version;
    const commit = process.env['VCS_REF'];
    if (commit) return commit;
    return 'dev';
  }

  private buildFilename(date: Date, ext: 'sql' | 'tar.gz'): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    const version = this.resolveVersion().replace(/[^A-Za-z0-9._-]/g, '-');
    return `utenzepa_${y}${mo}${d}_${h}${mi}${s}_${version}.${ext}`;
  }

  private parseFilenameDate(filename: string): Date {
    const match = filename.match(FILENAME_DATE_PATTERN);
    if (!match) return new Date(0);
    const [, y, mo, d, h, mi, s] = match;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }

  private resolvePhotosDir(): string {
    return process.env.PHOTOS_DIR ?? path.join(process.cwd(), 'photos');
  }

  private resolveAttachmentsDir(): string {
    return process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'attachments');
  }

  getBackupPath(filename: string): string {
    if (!FILENAME_PATTERN.test(filename)) {
      throw new Error('Nome file non valido');
    }
    return path.join(this.backupDir, filename);
  }

  /**
   * Scrive il dump SQL completo (stessa logica di sempre) in destPath.
   * Estratta da createBackup() per essere riusata identica sia per un
   * backup ".sql" semplice sia come "dump.sql" dentro l'archivio ".tar.gz"
   * quando si include anche le foto.
   */
  private async writeDump(destPath: string): Promise<void> {
    const conn = await createConnection(this.dbConfig());
    const writeStream = fs.createWriteStream(destPath);
    const write = (s: string): Promise<void> =>
      new Promise((res, rej) => writeStream.write(s, (err) => (err ? rej(err) : res())));

    try {
      await write('-- UtenzePA backup\n');
      await write(`-- Created: ${new Date().toISOString()}\n\n`);
      await write('SET FOREIGN_KEY_CHECKS=0;\n');
      await write('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n\n');

      const [tables] = await conn.query<RowDataPacket[]>('SHOW TABLES');
      for (const tableRow of tables) {
        const table = Object.values(tableRow)[0] as string;
        const [[createRow]] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
        await write(`DROP TABLE IF EXISTS \`${table}\`;\n`);
        await write(`${createRow['Create Table'] as string};\n\n`);

        const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM \`${table}\``);
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]);
          const colList = cols.map((c) => `\`${c}\``).join(', ');
          for (const row of rows) {
            const vals = cols.map((c) => escapeValue(row[c])).join(', ');
            await write(`INSERT INTO \`${table}\` (${colList}) VALUES (${vals});\n`);
          }
          await write('\n');
        }
      }

      await write('SET FOREIGN_KEY_CHECKS=1;\n');
      await new Promise<void>((res, rej) =>
        writeStream.end((err: Error | null) => (err ? rej(err) : res())),
      );
    } catch (err) {
      writeStream.destroy();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      throw err;
    } finally {
      await conn.end().catch(() => {});
    }
  }

  // includePhotos/includeAttachments: solo sui backup manuali (POST /backup)
  // — lo schedulato (handleScheduledBackup) resta sempre solo SQL, per non far
  // crescere senza controllo lo storage dei backup giornalieri con retention
  // 30gg quando ci sono molte foto o molti allegati.
  async createBackup(includePhotos = false, includeAttachments = false): Promise<BackupInfo> {
    const archive = includePhotos || includeAttachments;
    const ext = archive ? 'tar.gz' : 'sql';
    const filename = this.buildFilename(new Date(), ext);
    const finalPath = path.join(this.backupDir, filename);
    const tmpSqlPath = `${finalPath}.sql.tmp`;

    try {
      await this.writeDump(tmpSqlPath);

      if (!archive) {
        fs.renameSync(tmpSqlPath, finalPath);
      } else {
        const stagingDir = fs.mkdtempSync(path.join(this.backupDir, '.staging-'));
        try {
          fs.renameSync(tmpSqlPath, path.join(stagingDir, 'dump.sql'));
          // Collegamenti, non copie: con GB di allegati una copia raddoppiava
          // lo spazio occupato. tar segue i collegamenti (follow).
          const photosDir = this.resolvePhotosDir();
          if (includePhotos && fs.existsSync(photosDir)) {
            fs.symlinkSync(path.resolve(photosDir), path.join(stagingDir, 'photos'), 'dir');
          }
          const attachmentsDir = this.resolveAttachmentsDir();
          if (includeAttachments && fs.existsSync(attachmentsDir)) {
            fs.symlinkSync(path.resolve(attachmentsDir), path.join(stagingDir, 'attachments'), 'dir');
          }
          const tmpArchivePath = `${finalPath}.tmp`;
          // Compressione minima: PDF e foto sono già compressi, il livello
          // di default costava solo tempo.
          await tar.create(
            {
              gzip: { level: 1 },
              file: tmpArchivePath,
              cwd: stagingDir,
              follow: true,
              // I pezzi di upload in corso (attachments/tmp) non vanno nel backup.
              filter: (p) => !/^attachments\/tmp(\/|$)/.test(p),
            },
            fs.readdirSync(stagingDir),
          );
          fs.renameSync(tmpArchivePath, finalPath);
        } finally {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      }
    } catch (err) {
      if (fs.existsSync(tmpSqlPath)) fs.unlinkSync(tmpSqlPath);
      this.logger.error(`Backup fallito: ${(err as Error).message}`);
      throw err;
    }

    const stat = fs.statSync(finalPath);
    this.logger.log(`Backup creato: ${filename} (${stat.size} byte)`);
    return { filename, size: stat.size, createdAt: this.parseFilenameDate(filename) };
  }

  async listBackups(): Promise<BackupInfo[]> {
    const files = fs
      .readdirSync(this.backupDir)
      .filter((f) => FILENAME_PATTERN.test(f))
      .map((filename) => {
        const stat = fs.statSync(path.join(this.backupDir, filename));
        return { filename, size: stat.size, createdAt: this.parseFilenameDate(filename) };
      });

    return files.sort((a, b) => (a.filename < b.filename ? 1 : a.filename > b.filename ? -1 : 0));
  }

  async deleteBackup(filename: string): Promise<void> {
    const filePath = this.getBackupPath(filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  /**
   * Rimuove dal dump SQL i blocchi (DROP TABLE + CREATE TABLE + INSERT) delle
   * tabelle escluse — usato per ripristinare solo i dati di dominio senza
   * toccare utenti/branding attuali. Il dump e' sempre generato da
   * createBackup() con un DROP TABLE IF EXISTS come prima riga di ogni
   * blocco tabella (vedi sopra): e' un delimitatore affidabile, a differenza
   * di uno split su ';' che romperebbe su valori con punto e virgola dentro
   * stringhe escapate. Lo statement finale SET FOREIGN_KEY_CHECKS=1 va
   * sempre preservato anche se la tabella esclusa e' l'ultima del dump —
   * per questo viene isolato ed accodato a parte, non lasciato dentro
   * l'ultimo blocco.
   */
  private filterDumpTables(sqlContent: string, excludeTables: string[]): string {
    if (excludeTables.length === 0) return sqlContent;
    const excludeSet = new Set(excludeTables);

    const tailMarker = 'SET FOREIGN_KEY_CHECKS=1;';
    const tailIndex = sqlContent.lastIndexOf(tailMarker);
    const body = tailIndex >= 0 ? sqlContent.slice(0, tailIndex) : sqlContent;
    const tail = tailIndex >= 0 ? sqlContent.slice(tailIndex) : '';

    const dropRegex = /^DROP TABLE IF EXISTS `([^`]+)`;$/gm;
    const matches = [...body.matchAll(dropRegex)];
    if (matches.length === 0) return sqlContent;

    let result = body.slice(0, matches[0].index);
    for (let i = 0; i < matches.length; i++) {
      const tableName = matches[i][1];
      const blockStart = matches[i].index as number;
      const blockEnd = i + 1 < matches.length ? (matches[i + 1].index as number) : body.length;
      if (!excludeSet.has(tableName)) {
        result += body.slice(blockStart, blockEnd);
      } else {
        this.logger.log(`Restore: tabella "${tableName}" esclusa`);
      }
    }
    return result + tail;
  }

  async restoreFromFile(filePath: string, excludeTables: string[] = []): Promise<void> {
    const isArchive = filePath.endsWith('.tar.gz');
    if (!isArchive) {
      await this.restoreSqlFile(filePath, excludeTables);
      return;
    }

    // Solo dump.sql in una cartella temporanea: foto e allegati vengono
    // estratti direttamente al loro posto (con GB di allegati, estrarre e poi
    // copiare occupava il doppio dello spazio).
    const extractDir = fs.mkdtempSync(path.join(this.backupDir, '.restore-'));
    try {
      await tar.extract({ file: filePath, cwd: extractDir, filter: (p) => p === 'dump.sql' });
      const sqlPath = path.join(extractDir, 'dump.sql');
      if (!fs.existsSync(sqlPath)) {
        throw new Error('Archivio di backup non valido: dump.sql mancante');
      }
      await this.restoreSqlFile(sqlPath, excludeTables);
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    // Merge sopra le cartelle attuali, nessuno svuotamento preventivo: un
    // file rimasto orfano (riga assente dal dump appena importato) resta,
    // "drift accettabile" come per le foto rimosse dalla UI prima di un backup.
    // Foto sovrascritte; allegati mai (nome univoco, contenuto immutabile):
    // ricaricare un archivio non riscrive i file già presenti.
    await this.extractFolder(filePath, 'photos', this.resolvePhotosDir(), false);
    await this.extractFolder(filePath, 'attachments', this.resolveAttachmentsDir(), true);
  }

  private async extractFolder(
    archivePath: string,
    folder: string,
    destDir: string,
    keepExisting: boolean,
  ): Promise<void> {
    const prefix = `${folder}/`;
    fs.mkdirSync(destDir, { recursive: true });
    await tar.extract({
      file: archivePath,
      cwd: destDir,
      strip: 1,
      keep: keepExisting,
      filter: (p) => p.startsWith(prefix),
    });
  }

  private async restoreSqlFile(sqlFilePath: string, excludeTables: string[]): Promise<void> {
    const rawSql = fs.readFileSync(sqlFilePath, 'utf8');
    const sqlContent = this.filterDumpTables(rawSql, excludeTables);
    const conn = await createConnection({ ...this.dbConfig(), multipleStatements: true });
    try {
      await conn.query(sqlContent);
      this.logger.log(`Restore completato da: ${sqlFilePath}`);
    } catch (err) {
      this.logger.error(`Restore fallito: ${(err as Error).message}`);
      throw err;
    } finally {
      await conn.end().catch(() => {});
    }
  }

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
      this.logger.log(
        `Retention: cancellati ${deleted.length} backup oltre ${retentionDays} giorni`,
      );
    }
    return { deleted };
  }

  status(): BackupJobStatus {
    return this.jobs;
  }

  private assertIdle(): void {
    if (this.jobs.creating || this.jobs.restoring) {
      throw new BadRequestException(
        'È già in corso la creazione o il ripristino di un backup: attendere che finisca.',
      );
    }
  }

  /** Avvia la creazione in background; l'esito si legge da status(). */
  startCreate(includePhotos: boolean, includeAttachments: boolean): BackupJobStatus {
    this.assertIdle();
    this.jobs.creating = { startedAt: new Date() };
    void this.createBackup(includePhotos, includeAttachments)
      .then((info) => {
        this.jobs.lastCreate = { finishedAt: new Date(), filename: info.filename };
      })
      .catch((err: Error) => {
        this.jobs.lastCreate = { finishedAt: new Date(), error: err.message };
      })
      .finally(() => {
        this.jobs.creating = null;
      });
    return this.jobs;
  }

  /**
   * Avvia il ripristino in background e mette l'app in manutenzione fino
   * alla fine. `prepare` produce il file da ripristinare (riassemblaggio dei
   * pezzi caricati: con GB anche questo richiede tempo); il file viene
   * sempre cancellato alla fine. Ritorna la promise del lavoro (per i test;
   * il controller non la aspetta).
   */
  startRestore(prepare: () => string, excludeTables: string[]): Promise<void> {
    this.assertIdle();
    this.jobs.restoring = { startedAt: new Date() };
    maintenance.start();
    let filePath: string | null = null;
    return (async () => {
      filePath = prepare();
      await this.restoreFromFile(filePath, excludeTables);
    })()
      .then(() => {
        this.jobs.lastRestore = { finishedAt: new Date() };
      })
      .catch((err: Error) => {
        this.logger.error(`Ripristino fallito: ${err.message}`);
        this.jobs.lastRestore = { finishedAt: new Date(), error: err.message };
      })
      .finally(() => {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        this.jobs.restoring = null;
        maintenance.end();
      });
  }

  createDownloadTicket(filename: string): string {
    const filePath = this.getBackupPath(filename);
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Backup non trovato');
    }
    const now = Date.now();
    for (const [key, t] of this.downloadTickets) {
      if (t.expiresAt < now) this.downloadTickets.delete(key);
    }
    const ticket = randomBytes(24).toString('hex');
    this.downloadTickets.set(ticket, { filename, expiresAt: now + DOWNLOAD_TICKET_TTL_MS });
    return ticket;
  }

  /** Monouso: il link scade al primo utilizzo o dopo un minuto. */
  redeemDownloadTicket(ticket: string): string {
    const entry = this.downloadTickets.get(ticket);
    this.downloadTickets.delete(ticket);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new BadRequestException('Link di download scaduto: riprovare dalla pagina Backup.');
    }
    return entry.filename;
  }

  async handleScheduledBackup(): Promise<void> {
    if (this.jobs.restoring || maintenance.active) {
      this.logger.warn('Backup schedulato saltato: ripristino in corso');
      return;
    }
    try {
      await this.createBackup();
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
      await this.applyRetention(retentionDays);
    } catch (err) {
      this.logger.error(`Backup schedulato fallito: ${(err as Error).message}`);
    }
  }
}
