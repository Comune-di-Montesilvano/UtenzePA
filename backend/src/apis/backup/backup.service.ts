import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar';
import { createConnection, RowDataPacket } from 'mysql2/promise';

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
  return `'${String(v)
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

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  readonly backupDir: string;

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

  // includePhotos: solo sui backup manuali (POST /backup con body
  // {includePhotos:true}) — lo schedulato (handleScheduledBackup) resta
  // sempre solo SQL, per non far crescere senza controllo lo storage dei
  // backup giornalieri con retention 30gg quando ci sono molte foto.
  async createBackup(includePhotos = false): Promise<BackupInfo> {
    const ext = includePhotos ? 'tar.gz' : 'sql';
    const filename = this.buildFilename(new Date(), ext);
    const finalPath = path.join(this.backupDir, filename);
    const tmpSqlPath = `${finalPath}.sql.tmp`;

    try {
      await this.writeDump(tmpSqlPath);

      if (!includePhotos) {
        fs.renameSync(tmpSqlPath, finalPath);
      } else {
        const stagingDir = fs.mkdtempSync(path.join(this.backupDir, '.staging-'));
        try {
          fs.renameSync(tmpSqlPath, path.join(stagingDir, 'dump.sql'));
          const photosDir = this.resolvePhotosDir();
          if (fs.existsSync(photosDir)) {
            fs.cpSync(photosDir, path.join(stagingDir, 'photos'), { recursive: true });
          }
          const tmpArchivePath = `${finalPath}.tmp`;
          await tar.create(
            { gzip: true, file: tmpArchivePath, cwd: stagingDir },
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

    const extractDir = fs.mkdtempSync(path.join(this.backupDir, '.restore-'));
    try {
      await tar.extract({ file: filePath, cwd: extractDir });
      const sqlPath = path.join(extractDir, 'dump.sql');
      if (!fs.existsSync(sqlPath)) {
        throw new Error('Archivio di backup non valido: dump.sql mancante');
      }
      await this.restoreSqlFile(sqlPath, excludeTables);

      // Foto: copiate per intero sopra la cartella attuale (merge, non
      // svuotamento preventivo) — un file eventualmente rimasto orfano
      // (riga cancellata dal dump appena importato) non viene ripulito qui,
      // stesso comportamento "drift accettabile" già presente per le foto
      // caricate e poi rimosse dalla UI prima di un backup.
      const archivedPhotosDir = path.join(extractDir, 'photos');
      if (fs.existsSync(archivedPhotosDir)) {
        const photosDir = this.resolvePhotosDir();
        fs.mkdirSync(photosDir, { recursive: true });
        fs.cpSync(archivedPhotosDir, photosDir, { recursive: true });
        this.logger.log(`Restore: foto ripristinate da ${archivedPhotosDir}`);
      }
    } finally {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
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

  async handleScheduledBackup(): Promise<void> {
    try {
      await this.createBackup();
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
      await this.applyRetention(retentionDays);
    } catch (err) {
      this.logger.error(`Backup schedulato fallito: ${(err as Error).message}`);
    }
  }
}
