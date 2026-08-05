import { Test, TestingModule } from '@nestjs/testing';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

describe('BackupController', () => {
  let controller: BackupController;
  let service: jest.Mocked<BackupService>;

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
          },
        },
      ],
    }).compile();

    controller = module.get(BackupController);
    service = module.get(BackupService);
  });

  it('create delega a service.createBackup', async () => {
    const info = { filename: 'utenzepa_20260101_000000.sql', size: 10, createdAt: new Date() };
    service.createBackup.mockResolvedValue(info);

    await expect(controller.create()).resolves.toEqual(info);
    expect(service.createBackup).toHaveBeenCalled();
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
});
