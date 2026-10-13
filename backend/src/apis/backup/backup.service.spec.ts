import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as mysql2Promise from 'mysql2/promise';
import { BackupService } from './backup.service';
import { maintenance } from '@common/maintenance/maintenance';

jest.mock('mysql2/promise');

describe('BackupService', () => {
  let service: BackupService;
  let backupDir: string;
  let mockConn: { query: jest.Mock; end: jest.Mock };

  beforeEach(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-test-'));
    process.env.BACKUP_DIR = backupDir;
    process.env.MYSQL_HOST = 'localhost';
    process.env.MYSQL_PORT = '3306';
    process.env.MYSQL_USER = 'root';
    process.env.MYSQL_PASSWORD = 'secret';
    process.env.MYSQL_DB = 'mydatabase';

    mockConn = {
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };
    (mysql2Promise.createConnection as jest.Mock).mockResolvedValue(mockConn);

    service = new BackupService();
  });

  afterEach(() => {
    fs.rmSync(backupDir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.PHOTOS_DIR;
    delete process.env.ATTACHMENTS_DIR;
  });

  it('createBackup si connette al DB con la config corretta e produce un file .sql', async () => {
    mockConn.query
      .mockResolvedValueOnce([[{ Tables_in_mydatabase: 'users' }], []])
      .mockResolvedValueOnce([[{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (`id` INT)' }], []])
      .mockResolvedValueOnce([[], []]);

    const result = await service.createBackup();

    expect(mysql2Promise.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 3306, user: 'root', password: 'secret', database: 'mydatabase' }),
    );
    expect(result.filename).toMatch(/^utenzepa_\d{8}_\d{6}_[A-Za-z0-9._-]+\.sql$/);
    expect(fs.existsSync(path.join(backupDir, result.filename))).toBe(true);
    expect(mockConn.end).toHaveBeenCalled();
  });

  it('createBackup include APP_VERSION nel nome file quando presente', async () => {
    process.env.APP_VERSION = 'v1.2.3';
    mockConn.query
      .mockResolvedValueOnce([[], []]);

    const result = await service.createBackup();

    expect(result.filename).toContain('_v1.2.3.sql');
    delete process.env.APP_VERSION;
  });

  it('createBackup non lascia file parziali se la connessione fallisce', async () => {
    (mysql2Promise.createConnection as jest.Mock).mockRejectedValue(new Error('connection refused'));

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

  it('restoreFromFile si connette con multipleStatements ed esegue il contenuto SQL', async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    fs.writeFileSync(sqlFile, 'INSERT INTO x VALUES (1);');
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(sqlFile);

    expect(mysql2Promise.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ multipleStatements: true }),
    );
    expect(mockConn.query).toHaveBeenCalledWith('INSERT INTO x VALUES (1);');
    expect(mockConn.end).toHaveBeenCalled();
  });

  it('restoreFromFile rimuove i blocchi delle tabelle escluse (excludeTables)', async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    fs.writeFileSync(
      sqlFile,
      [
        '-- UtenzePA backup',
        '',
        'SET FOREIGN_KEY_CHECKS=0;',
        '',
        'DROP TABLE IF EXISTS `system_users`;',
        'CREATE TABLE `system_users` (`id` INT);',
        '',
        "INSERT INTO `system_users` (`id`) VALUES (1);",
        '',
        'DROP TABLE IF EXISTS `assets`;',
        'CREATE TABLE `assets` (`id` INT, `created_by_user_id` INT REFERENCES `system_users` (`id`));',
        '',
        "INSERT INTO `assets` (`id`) VALUES (1);",
        '',
        'SET FOREIGN_KEY_CHECKS=1;',
      ].join('\n'),
    );
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(sqlFile, ['system_users']);

    const executedSql = mockConn.query.mock.calls[0][0] as string;
    expect(executedSql).not.toContain('DROP TABLE IF EXISTS `system_users`;');
    expect(executedSql).not.toContain('INSERT INTO `system_users`');
    // La FK verso system_users nella CREATE TABLE di `assets` deve restare —
    // e' solo una colonna, non il blocco della tabella esclusa.
    expect(executedSql).toContain('REFERENCES `system_users`');
    expect(executedSql).toContain('DROP TABLE IF EXISTS `assets`;');
    expect(executedSql).toContain("INSERT INTO `assets`");
    expect(executedSql.trimEnd()).toMatch(/SET FOREIGN_KEY_CHECKS=1;$/);
  });

  it('restoreFromFile con excludeTables vuoto esegue il dump invariato', async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    const content = 'INSERT INTO x VALUES (1);';
    fs.writeFileSync(sqlFile, content);
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(sqlFile);

    expect(mockConn.query).toHaveBeenCalledWith(content);
  });

  it("restoreFromFile propaga l'errore se la query fallisce", async () => {
    const sqlFile = path.join(backupDir, 'restore-input.sql');
    fs.writeFileSync(sqlFile, 'INVALID SQL;');
    mockConn.query.mockRejectedValue(new Error('ERROR 1064: syntax error'));

    await expect(service.restoreFromFile(sqlFile)).rejects.toThrow('ERROR 1064: syntax error');
    expect(mockConn.end).toHaveBeenCalled();
  });

  it('createBackup(true) produce un .tar.gz con dump.sql + foto', async () => {
    const photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-photos-'));
    process.env.PHOTOS_DIR = photosDir;
    fs.mkdirSync(path.join(photosDir, 'asset', '1'), { recursive: true });
    fs.writeFileSync(path.join(photosDir, 'asset', '1', 'foo.jpg'), 'fake-image-bytes');

    mockConn.query
      .mockResolvedValueOnce([[{ Tables_in_mydatabase: 'users' }], []])
      .mockResolvedValueOnce([[{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (`id` INT)' }], []])
      .mockResolvedValueOnce([[], []]);

    const result = await service.createBackup(true);

    expect(result.filename).toMatch(/^utenzepa_\d{8}_\d{6}_[A-Za-z0-9._-]+\.tar\.gz$/);
    const archivePath = path.join(backupDir, result.filename);
    expect(fs.existsSync(archivePath)).toBe(true);
    // Nessun file di lavoro (staging/tmp) rimasto in giro dopo la creazione.
    expect(fs.readdirSync(backupDir)).toEqual([result.filename]);

    fs.rmSync(photosDir, { recursive: true, force: true });
  });

  it('restoreFromFile su un .tar.gz ripristina il DB e copia le foto nella PHOTOS_DIR corrente', async () => {
    const tar = await import('tar');
    const sourcePhotosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-src-'));
    const targetPhotosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-dst-'));
    process.env.PHOTOS_DIR = targetPhotosDir;

    fs.mkdirSync(path.join(sourcePhotosDir, 'photos', 'asset', '2'), { recursive: true });
    fs.writeFileSync(path.join(sourcePhotosDir, 'photos', 'asset', '2', 'bar.jpg'), 'restored-bytes');
    fs.writeFileSync(path.join(sourcePhotosDir, 'dump.sql'), 'INSERT INTO x VALUES (1);');

    const archivePath = path.join(backupDir, 'utenzepa_20260101_000000.tar.gz');
    await tar.create({ gzip: true, file: archivePath, cwd: sourcePhotosDir }, ['dump.sql', 'photos']);
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(archivePath);

    expect(mockConn.query).toHaveBeenCalledWith('INSERT INTO x VALUES (1);');
    const restoredFile = path.join(targetPhotosDir, 'asset', '2', 'bar.jpg');
    expect(fs.existsSync(restoredFile)).toBe(true);
    expect(fs.readFileSync(restoredFile, 'utf8')).toBe('restored-bytes');
    // Nessuna cartella di estrazione temporanea rimasta.
    expect(fs.readdirSync(backupDir)).toEqual(['utenzepa_20260101_000000.tar.gz']);

    fs.rmSync(sourcePhotosDir, { recursive: true, force: true });
    fs.rmSync(targetPhotosDir, { recursive: true, force: true });
  });

  it('createBackup(false, true): archivio con attachments/ senza tmp/ e senza photos/', async () => {
    const tar = await import('tar');
    const attDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-att-'));
    process.env.ATTACHMENTS_DIR = attDir;
    fs.mkdirSync(path.join(attDir, 'contract', '3'), { recursive: true });
    fs.writeFileSync(path.join(attDir, 'contract', '3', 'a.pdf'), '%PDF-1.7');
    fs.mkdirSync(path.join(attDir, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(attDir, 'tmp', 'x.chunk0'), 'pezzo');

    mockConn.query
      .mockResolvedValueOnce([[{ Tables_in_mydatabase: 'users' }], []])
      .mockResolvedValueOnce([[{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (`id` INT)' }], []])
      .mockResolvedValueOnce([[], []]);

    const result = await service.createBackup(false, true);

    expect(result.filename.endsWith('.tar.gz')).toBe(true);
    const listed: string[] = [];
    await tar.list({
      file: path.join(backupDir, result.filename),
      onReadEntry: (e) => {
        listed.push(e.path);
      },
    });
    expect(listed).toEqual(expect.arrayContaining(['dump.sql', 'attachments/contract/3/a.pdf']));
    expect(listed.some((p) => p.startsWith('attachments/tmp'))).toBe(false);
    expect(listed.some((p) => p.startsWith('photos'))).toBe(false);
    expect(fs.readdirSync(backupDir)).toEqual([result.filename]);

    fs.rmSync(attDir, { recursive: true, force: true });
  });

  it('restoreFromFile su un .tar.gz copia gli allegati nella ATTACHMENTS_DIR corrente', async () => {
    const tar = await import('tar');
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-att-src-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-att-dst-'));
    process.env.ATTACHMENTS_DIR = target;

    fs.mkdirSync(path.join(source, 'attachments', 'act', '5'), { recursive: true });
    fs.writeFileSync(path.join(source, 'attachments', 'act', '5', 'b.pdf'), 'restored-pdf');
    fs.writeFileSync(path.join(source, 'dump.sql'), 'INSERT INTO x VALUES (1);');

    const archivePath = path.join(backupDir, 'utenzepa_20260101_000000.tar.gz');
    await tar.create({ gzip: true, file: archivePath, cwd: source }, ['dump.sql', 'attachments']);
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(archivePath);

    const restored = path.join(target, 'act', '5', 'b.pdf');
    expect(fs.readFileSync(restored, 'utf8')).toBe('restored-pdf');
    expect(fs.readdirSync(backupDir)).toEqual(['utenzepa_20260101_000000.tar.gz']);

    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  });

  it('applyRetention cancella solo i backup più vecchi della retention', async () => {
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

    const result = await service.applyRetention(30);

    expect(result.deleted).toEqual([oldName]);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('createBackup con allegati non tocca le cartelle di origine (collegamenti, non copie)', async () => {
    const attDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-att-src-'));
    process.env.ATTACHMENTS_DIR = attDir;
    fs.mkdirSync(path.join(attDir, 'plant', '7'), { recursive: true });
    fs.writeFileSync(path.join(attDir, 'plant', '7', 'p.dwg'), 'AC1018');
    mockConn.query.mockResolvedValueOnce([[], []]);

    await service.createBackup(false, true);

    expect(fs.readFileSync(path.join(attDir, 'plant', '7', 'p.dwg'), 'utf8')).toBe('AC1018');
    fs.rmSync(attDir, { recursive: true, force: true });
  });

  it('restoreFromFile non sovrascrive gli allegati già presenti', async () => {
    const tar = await import('tar');
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-keep-src-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-keep-dst-'));
    process.env.ATTACHMENTS_DIR = target;
    fs.mkdirSync(path.join(source, 'attachments', 'act', '5'), { recursive: true });
    fs.writeFileSync(path.join(source, 'attachments', 'act', '5', 'b.pdf'), 'dal-backup');
    fs.writeFileSync(path.join(source, 'attachments', 'act', '5', 'c.pdf'), 'nuovo');
    fs.writeFileSync(path.join(source, 'dump.sql'), 'INSERT INTO x VALUES (1);');
    fs.mkdirSync(path.join(target, 'act', '5'), { recursive: true });
    fs.writeFileSync(path.join(target, 'act', '5', 'b.pdf'), 'gia-presente');

    const archivePath = path.join(backupDir, 'utenzepa_20260101_000000.tar.gz');
    await tar.create({ gzip: true, file: archivePath, cwd: source }, ['dump.sql', 'attachments']);
    mockConn.query.mockResolvedValue([[], []]);

    await service.restoreFromFile(archivePath);

    expect(fs.readFileSync(path.join(target, 'act', '5', 'b.pdf'), 'utf8')).toBe('gia-presente');
    expect(fs.readFileSync(path.join(target, 'act', '5', 'c.pdf'), 'utf8')).toBe('nuovo');
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  });

  describe('lavori in background', () => {
    afterEach(() => maintenance.end());

    it('startRestore: app in manutenzione durante il lavoro, file sempre cancellato', async () => {
      const sqlFile = path.join(backupDir, 'u1.sql');
      fs.writeFileSync(sqlFile, 'INSERT INTO x VALUES (1);');
      let duringRestore: boolean | undefined;
      mockConn.query.mockImplementation(async () => {
        duringRestore = maintenance.active;
        return [[], []];
      });

      const job = service.startRestore(() => sqlFile, []);
      expect(maintenance.active).toBe(true);
      expect(service.status().restoring).not.toBeNull();
      await job;

      expect(duringRestore).toBe(true);
      expect(maintenance.active).toBe(false);
      expect(service.status().restoring).toBeNull();
      expect(service.status().lastRestore?.error).toBeUndefined();
      expect(fs.existsSync(sqlFile)).toBe(false);
    });

    it("startRestore: un errore toglie la manutenzione e resta nello stato", async () => {
      const sqlFile = path.join(backupDir, 'u2.sql');
      fs.writeFileSync(sqlFile, 'INVALID;');
      mockConn.query.mockRejectedValue(new Error('ERROR 1064'));

      await service.startRestore(() => sqlFile, []);

      expect(maintenance.active).toBe(false);
      expect(service.status().lastRestore?.error).toBe('ERROR 1064');
      expect(fs.existsSync(sqlFile)).toBe(false);
    });

    it('startCreate rifiuta un secondo lavoro mentre il primo è in corso', async () => {
      let release!: () => void;
      (mysql2Promise.createConnection as jest.Mock).mockImplementationOnce(
        () => new Promise((res) => (release = () => res(mockConn))),
      );
      mockConn.query.mockResolvedValueOnce([[], []]);

      service.startCreate(false, false);
      expect(() => service.startCreate(false, false)).toThrow('già in corso');
      expect(() => service.startRestore(() => 'x', [])).toThrow('già in corso');

      release();
      await new Promise((r) => setTimeout(r, 50));
      expect(service.status().creating).toBeNull();
      expect(service.status().lastCreate?.filename).toMatch(/\.sql$/);
    });

    it('handleScheduledBackup salta durante un ripristino', async () => {
      (mysql2Promise.createConnection as jest.Mock).mockClear();
      maintenance.start();
      await service.handleScheduledBackup();
      expect(mysql2Promise.createConnection).not.toHaveBeenCalled();
    });
  });

  it('ticket di download: monouso, solo per backup esistenti', () => {
    const name = 'utenzepa_20260101_000000.sql';
    expect(() => service.createDownloadTicket(name)).toThrow('Backup non trovato');
    fs.writeFileSync(path.join(backupDir, name), 'a');

    const ticket = service.createDownloadTicket(name);

    expect(service.redeemDownloadTicket(ticket)).toBe(name);
    expect(() => service.redeemDownloadTicket(ticket)).toThrow('scaduto');
    expect(() => service.redeemDownloadTicket('inventato')).toThrow('scaduto');
  });
});
