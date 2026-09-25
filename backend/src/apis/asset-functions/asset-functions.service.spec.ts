import { ConflictException } from '@nestjs/common';
import { AssetFunctionsService } from './asset-functions.service';

describe('AssetFunctionsService', () => {
  let service: AssetFunctionsService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let assetRepo: { count: jest.Mock };
  let qb: { where: jest.Mock; andWhere: jest.Mock; orderBy: jest.Mock; getMany: jest.Mock };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => d),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new AssetFunctionsService(repo as never, assetRepo as never);
  });

  it('findAll filtra le funzioni non cancellate di default', async () => {
    await service.findAll();
    expect(qb.where).toHaveBeenCalledWith('asset_functions.deleted = :deleted_default', {
      deleted_default: 0,
    });
  });

  it('remove rifiuta con 409 se la funzione è usata da immobili non cancellati', async () => {
    repo.findOne.mockResolvedValue({ id: 3, deleted: false });
    assetRepo.count.mockResolvedValue(2);

    await expect(service.remove(3, 1)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({ where: { function_id: 3, deleted: false } });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('remove marca cancellata una funzione non usata', async () => {
    repo.findOne.mockResolvedValue({ id: 3, deleted: false });

    await service.remove(3, 1);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, deleted: true, updated_by_user_id: 1 }),
    );
  });
});
