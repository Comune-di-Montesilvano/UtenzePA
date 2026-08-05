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
