import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { spawn } from 'child_process';
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

  private parseFilenameDate(filename: string): Date {
    const match = filename.match(/^utenzepa_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.sql$/);
    if (!match) return new Date(0);
    const [, y, mo, d, h, mi, s] = match;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
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
}
