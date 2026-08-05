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
