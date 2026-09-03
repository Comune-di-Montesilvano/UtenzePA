import * as fs from 'fs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoEntityType } from './enum/photo-entity-type.enum';

jest.mock('fs');

describe('PhotosService', () => {
  let service: PhotosService;
  let photoRepo: { count: jest.Mock; create: jest.Mock; save: jest.Mock; findOne: jest.Mock; remove: jest.Mock };
  let assetRepo: { exists: jest.Mock };
  let utilityRepo: { exists: jest.Mock };

  beforeEach(() => {
    (fs.mkdirSync as jest.Mock).mockReset();
    (fs.writeFileSync as jest.Mock).mockReset();
    (fs.unlinkSync as jest.Mock).mockReset();

    photoRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, ...data })),
      findOne: jest.fn(),
      remove: jest.fn(async (photo) => photo),
    };
    assetRepo = { exists: jest.fn().mockResolvedValue(true) };
    utilityRepo = { exists: jest.fn().mockResolvedValue(true) };

    service = new PhotosService(photoRepo as never, assetRepo as never, utilityRepo as never);
  });

  describe('create', () => {
    it('rifiuta un mime type non in allowlist', async () => {
      const file = { mimetype: 'application/pdf', buffer: Buffer.from(''), originalname: 'f.pdf' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rifiuta se l\'entità collegata non esiste', async () => {
      assetRepo.exists.mockResolvedValue(false);
      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x'), originalname: 'f.jpg' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 999 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rifiuta se è già stato raggiunto il limite di 10 foto', async () => {
      photoRepo.count.mockResolvedValue(10);
      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x'), originalname: 'f.jpg' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('salva il file jpeg così com\'è e crea la riga DB', async () => {
      const buffer = Buffer.from('jpeg-bytes');
      const file = { mimetype: 'image/jpeg', buffer, originalname: 'foto.jpg' } as Express.Multer.File;

      const result = await service.create({ entityType: PhotoEntityType.UTILITY, entityId: 42 }, file, 7);

      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), buffer);
      expect(photoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: PhotoEntityType.UTILITY,
          entity_id: 42,
          mime_type: 'image/jpeg',
          original_filename: 'foto.jpg',
          created_by_user_id: 7,
          updated_by_user_id: 7,
        }),
      );
      expect(result.id).toBe(1);
    });

    it('converte heic a jpeg prima di scrivere su disco', async () => {
      const converted = Buffer.from('converted-jpeg');
      jest.doMock('heic-convert', () => jest.fn().mockResolvedValue(converted), { virtual: true });
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PhotosService: FreshPhotosService } = require('./photos.service');
      const freshService = new FreshPhotosService(photoRepo as never, assetRepo as never, utilityRepo as never);

      const file = { mimetype: 'image/heic', buffer: Buffer.from('heic-bytes'), originalname: 'foto.heic' } as Express.Multer.File;

      await freshService.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1);

      expect(photoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mime_type: 'image/jpeg' }));
      jest.dontMock('heic-convert');
    });
  });

  describe('findAll', () => {
    it('filtra per entity_type/entity_id e deleted=false', async () => {
      const repoFindAll = { ...photoRepo, find: jest.fn().mockResolvedValue([]) };
      const svc = new PhotosService(repoFindAll as never, assetRepo as never, utilityRepo as never);

      await svc.findAll(PhotoEntityType.ASSET, 5);

      expect(repoFindAll.find).toHaveBeenCalledWith({
        where: { entity_type: PhotoEntityType.ASSET, entity_id: 5, deleted: false },
        order: { create_date: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('lancia NotFoundException se la foto non esiste', async () => {
      photoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('rimuove il file fisico e soft-elimina la riga', async () => {
      const photo = { id: 1, file_path: 'asset/1/x.jpg', deleted: false };
      photoRepo.findOne.mockResolvedValue(photo);

      await service.remove(1, 9);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(photoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: true, updated_by_user_id: 9 }),
      );
    });

    it('procede comunque se il file è già assente su disco (ENOENT)', async () => {
      const photo = { id: 1, file_path: 'asset/1/x.jpg', deleted: false };
      photoRepo.findOne.mockResolvedValue(photo);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        const err = new Error('not found') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      });

      await expect(service.remove(1, 9)).resolves.toBeUndefined();
      expect(photoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
    });
  });
});
