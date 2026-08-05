import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { ImportEntityType } from './entity-type.enum';

describe('ImportController', () => {
  let controller: ImportController;
  let importService: jest.Mocked<ImportService>;
  let chunkedUpload: jest.Mocked<ChunkedUploadService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportController],
      providers: [
        { provide: ImportService, useValue: { importFromFile: jest.fn() } },
        { provide: ChunkedUploadService, useValue: { saveChunk: jest.fn(), assemble: jest.fn() } },
      ],
    }).compile();

    controller = module.get(ImportController);
    importService = module.get(ImportService);
    chunkedUpload = module.get(ChunkedUploadService);
  });

  it('chunk rifiuta un entityType non valido', async () => {
    const file = { buffer: Buffer.from('a') } as Express.Multer.File;

    await expect(
      controller.chunk('non-valido', file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('chunk salva il chunk per un entityType valido', async () => {
    const file = { buffer: Buffer.from('a') } as Express.Multer.File;

    await controller.chunk('immobili', file, { uploadId: 'u1', chunkIndex: 0, totalChunks: 1 });

    expect(chunkedUpload.saveChunk).toHaveBeenCalledWith('u1', 0, 1, file.buffer, expect.stringContaining('tmp'));
  });

  it('finalize assembla ed esegue l\'import', async () => {
    chunkedUpload.assemble.mockReturnValue('/tmp/u1.csv');
    importService.importFromFile.mockResolvedValue({ imported: 3, skipped: 0 });

    const result = await controller.finalize('immobili', { uploadId: 'u1', totalChunks: 1 });

    expect(importService.importFromFile).toHaveBeenCalledWith(ImportEntityType.ASSETS, '/tmp/u1.csv');
    expect(result).toEqual({ imported: 3, skipped: 0 });
  });
});
