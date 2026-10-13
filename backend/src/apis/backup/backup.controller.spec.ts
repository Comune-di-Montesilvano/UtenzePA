import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupController, BackupDownloadController } from './backup.controller';
import { BackupService } from './backup.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AuthService } from '@apis/auth/auth.service';
import { BadRequestException, StreamableFile } from '@nestjs/common';

describe('BackupController', () => {
  let controller: BackupController;
  let service: jest.Mocked<BackupService>;
  let chunkedUpload: jest.Mocked<ChunkedUploadService>;
  let authService: jest.Mocked<AuthService>;
  const admin = { id: 1, email: 'admin@example.com', role: 'Admin' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        {
          provide: BackupService,
          useValue: {
            startCreate: jest.fn(),
            status: jest.fn(),
            listBackups: jest.fn(),
            deleteBackup: jest.fn(),
            createDownloadTicket: jest.fn(),
            startRestore: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ChunkedUploadService,
          useValue: {
            saveChunk: jest.fn(),
            assemble: jest.fn(),
            isComplete: jest.fn().mockReturnValue(true),
          },
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

  it('create avvia la creazione in background con le opzioni richieste', () => {
    controller.create({ includeAttachments: true });
    expect(service.startCreate).toHaveBeenCalledWith(false, true);
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

  it('downloadLink restituisce il ticket monouso', () => {
    service.createDownloadTicket.mockReturnValue('abc');
    expect(controller.downloadLink('utenzepa_20260101_000000.sql')).toEqual({ ticket: 'abc' });
  });

  it('restoreChunk salva il chunk con il limite di default di 20 GB', async () => {
    const file = { buffer: Buffer.from('data') } as Express.Multer.File;

    await controller.restoreChunk(file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 2 });

    expect(chunkedUpload.saveChunk).toHaveBeenCalledWith(
      'u1',
      0,
      2,
      file.buffer,
      expect.stringContaining('tmp'),
      20480 * 1024 * 1024,
    );
  });

  it('restoreFinalize rifiuta password errata senza avviare il ripristino', async () => {
    authService.validateUser.mockResolvedValue(null);

    await expect(
      controller.restoreFinalize({ uploadId: 'u1', totalChunks: 2, password: 'wrong' }, admin),
    ).rejects.toThrow(BadRequestException);

    expect(service.startRestore).not.toHaveBeenCalled();
  });

  it('restoreFinalize rifiuta un caricamento incompleto', async () => {
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.isComplete.mockReturnValue(false);

    await expect(
      controller.restoreFinalize({ uploadId: 'u1', totalChunks: 2, password: 'correct' }, admin),
    ).rejects.toThrow('Caricamento del file incompleto');

    expect(service.startRestore).not.toHaveBeenCalled();
  });

  it('restoreFinalize avvia il ripristino in background e risponde subito', async () => {
    authService.validateUser.mockResolvedValue({ id: 1 } as any);
    chunkedUpload.assemble.mockReturnValue('/tmp/u1.tar.gz');

    const result = await controller.restoreFinalize(
      {
        uploadId: 'u1',
        totalChunks: 2,
        password: 'correct',
        originalFilename: 'mio-backup.tar.gz',
        excludeUsers: true,
        excludeBranding: true,
      },
      admin,
    );

    expect(result).toEqual({ started: true });
    expect(authService.validateUser).toHaveBeenCalledWith('admin@example.com', 'correct');
    const [prepare, excludeTables] = service.startRestore.mock.calls[0];
    expect(excludeTables).toEqual(['system_users', 'app_settings']);
    // Il riassemblaggio avviene dentro il lavoro in background.
    expect(chunkedUpload.assemble).not.toHaveBeenCalled();
    expect(prepare()).toBe('/tmp/u1.tar.gz');
    expect(chunkedUpload.assemble).toHaveBeenCalledWith('u1', 2, expect.any(String), 'u1.tar.gz');
  });
});

describe('BackupDownloadController', () => {
  it('scambia il ticket con lo stream del file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-download-test-'));
    const filePath = path.join(dir, 'utenzepa_20260101_000000.sql');
    fs.writeFileSync(filePath, 'dump');
    const service = {
      redeemDownloadTicket: jest.fn().mockReturnValue('utenzepa_20260101_000000.sql'),
      getBackupPath: jest.fn().mockReturnValue(filePath),
    } as unknown as BackupService;
    const res = { set: jest.fn() };

    const result = new BackupDownloadController(service).download('t1', res as any);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'attachment; filename="utenzepa_20260101_000000.sql"',
        'Content-Length': '4',
      }),
    );
    result.getStream().destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
