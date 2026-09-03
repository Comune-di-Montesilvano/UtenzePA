import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as mysql2Promise from 'mysql2/promise';
import { BackupService } from './backup.service';

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
    expect(result.filename).toMatch(/^utenzepa_\d{8}_\d{6}\.sql$/);
    expect(fs.existsSync(path.join(backupDir, result.filename))).toBe(true);
    expect(mockConn.end).toHaveBeenCalled();
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
});
