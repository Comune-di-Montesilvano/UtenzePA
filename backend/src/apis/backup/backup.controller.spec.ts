import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AuthService } from '@apis/auth/auth.service';
import { BadRequestException } from '@nestjs/common';

describe('BackupController', () => {
  let controller: BackupController;
  let service: jest.Mocked<BackupService>;
  let chunkedUpload: jest.Mocked<ChunkedUploadService>;
  let authService: jest.Mocked<AuthService>;

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
            restoreFromFile: jest.fn(),
          },
        },
        {
          provide: ChunkedUploadService,
          useValue: { saveChunk: jest.fn(), assemble: jest.fn() },
        },
        {
          provide: AuthService,
          useValue: { validateUser: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(BackupController);
    service = module.get(BackupService);
    chunkedUpload = module.get(ChunkedUploadService);
    authService = module.get(AuthService);
  });

  it('create delega a service.createBackup', async () => {
    const info = { filename: 'utenzepa_20260101_000000.sql', size: 10, createdAt: new Date() };
    service.createBackup.mockResolvedValue(info);

    await expect(controller.create({})).resolves.toEqual(info);
    expect(service.createBackup).toHaveBeenCalledWith(false);
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

  it('restoreChunk salva il chunk ricevuto', async () => {
    const file = { buffer: Buffer.from('data') } as Express.Multer.File;

    await controller.restoreChunk(file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 2 });

    expect(chunkedUpload.saveChunk).toHaveBeenCalledWith(
      'u1',
      0,
      2,
      file.buffer,
      expect.stringContaining('tmp'),
      expect.any(Number),
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
    // assemble() nella realtà crea il file assemblato sul filesystem; qui il mock ritorna
    // solo il path, quindi va creato per davvero perché il controller lo cancella con
    // fs.unlinkSync dopo il restore.
    fs.writeFileSync('/tmp/restore.sql', 'dummy');
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/restore.sql');
    service.restoreFromFile.mockResolvedValue(undefined);

    const result = await controller.restoreFinalize(
      { uploadId: 'u1', totalChunks: 2, password: 'correct' },
      { id: 1, email: 'admin@example.com', role: 'Admin' },
    );

    expect(authService.validateUser).toHaveBeenCalledWith('admin@example.com', 'correct');
    expect(service.restoreFromFile).toHaveBeenCalledWith('/tmp/restore.sql', []);
    expect(result).toEqual({ restored: true });
  });

  it('restoreFinalize assembla come .tar.gz quando originalFilename lo indica', async () => {
    fs.writeFileSync('/tmp/restore.sql', 'dummy');
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/restore.sql');
    service.restoreFromFile.mockResolvedValue(undefined);

    await controller.restoreFinalize(
      { uploadId: 'u1', totalChunks: 2, password: 'correct', originalFilename: 'mio-backup.tar.gz' },
      { id: 1, email: 'admin@example.com', role: 'Admin' },
    );

    expect(chunkedUpload.assemble).toHaveBeenCalledWith('u1', 2, expect.any(String), 'u1.tar.gz');
  });

  it('restoreFinalize traduce excludeUsers/excludeBranding nelle tabelle da escludere', async () => {
    fs.writeFileSync('/tmp/restore-exclude.sql', 'dummy');
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/restore-exclude.sql');
    service.restoreFromFile.mockResolvedValue(undefined);

    await controller.restoreFinalize(
      {
        uploadId: 'u1',
        totalChunks: 2,
        password: 'correct',
        excludeUsers: true,
        excludeBranding: true,
      },
      { id: 1, email: 'admin@example.com', role: 'Admin' },
    );

    expect(service.restoreFromFile).toHaveBeenCalledWith('/tmp/restore-exclude.sql', [
      'system_users',
      'app_settings',
    ]);
  });

  it('restoreFinalize elimina il file assemblato anche se il restore fallisce', async () => {
    fs.writeFileSync('/tmp/restore-fail.sql', 'dummy');
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/restore-fail.sql');
    service.restoreFromFile.mockRejectedValue(new Error('mysql error'));

    await expect(
      controller.restoreFinalize(
        { uploadId: 'u1', totalChunks: 2, password: 'correct' },
        { id: 1, email: 'admin@example.com', role: 'Admin' },
      ),
    ).rejects.toThrow('mysql error');

    expect(fs.existsSync('/tmp/restore-fail.sql')).toBe(false);
  });
});
