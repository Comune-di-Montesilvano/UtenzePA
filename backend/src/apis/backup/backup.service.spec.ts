import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
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
        const resultFileArg = args.find((a) => a.startsWith('--result-file='));
        const outPath = resultFileArg!.replace(/^--result-file=/, '');
        // simula mysqldump: scrive un file di output non vuoto
        fs.writeFileSync(outPath, 'SQL DUMP CONTENT');
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

  it('applyRetention cancella solo i backup più vecchi della retention', async () => {
    // createdAt è derivato dal nome file (parseFilenameDate), non da stat.birthtime/mtime
    // (vedi nota Task 4/7: birthtime non è affidabile su ogni filesystem). Il nome del
    // file "recente" va quindi calcolato rispetto alla data reale del test, non
    // hardcodato, altrimenti col passare del tempo diventa "vecchio" e il test rompe.
    const pad = (n: number) => n.toString().padStart(2, '0');
    const buildName = (date: Date) => {
      const y = date.getFullYear();
      const mo = pad(date.getMonth() + 1);
      const d = pad(date.getDate());
      const h = pad(date.getHours());
      const mi = pad(date.getMinutes());
      const s = pad(date.getSeconds());
      return `utenzepa_${y}${mo}${d}_${h}${mi}${s}.sql`;
    };

    const oldName = 'utenzepa_20200101_000000.sql';
    const recentName = buildName(new Date());
    const oldFile = path.join(backupDir, oldName);
    const recentFile = path.join(backupDir, recentName);
    fs.writeFileSync(oldFile, 'old');
    fs.writeFileSync(recentFile, 'recent');
    fs.utimesSync(oldFile, new Date('2020-01-01'), new Date('2020-01-01'));
    fs.utimesSync(recentFile, new Date(), new Date());

    const result = await service.applyRetention(30);

    expect(result.deleted).toEqual([oldName]);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });
});
