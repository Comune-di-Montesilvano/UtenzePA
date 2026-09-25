import { ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { AssetNaturesService } from './asset-natures.service';

describe('AssetNaturesService', () => {
  let service: AssetNaturesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let assetRepo: { count: jest.Mock };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 1, ...d })),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new AssetNaturesService(repo as never, assetRepo as never);
  });

  it('findAll carica le funzioni ammesse non cancellate', async () => {
    await service.findAll();
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'asset_natures.functions',
      'functions',
      'functions.deleted = 0',
    );
  });

  it('create salva le funzioni ammesse come relazione deduplicata', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });

    await service.create({ name: 'Fabbricato', function_ids: [4, 5, 4] }, 9);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fabbricato',
        functions: [{ id: 4 }, { id: 5 }],
        created_by_user_id: 9,
      }),
    );
  });

  it('update rifiuta con 409 se rimuove una coppia usata da immobili', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });
    assetRepo.count.mockResolvedValue(3);

    await expect(service.update(1, { function_ids: [4] }, 9)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({
      where: { nature_id: 1, function_id: In([5]), deleted: false },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update sostituisce le funzioni ammesse se nessuna coppia rimossa è in uso', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });

    await service.update(1, { function_ids: [4, 6] }, 9);

    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ functions: [{ id: 4 }, { id: 6 }] }),
    );
  });

  it('update senza function_ids non tocca le coppie', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }] });

    await service.update(1, { name: 'Fabbricati' }, 9);

    expect(assetRepo.count).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('remove rifiuta con 409 se la natura è usata', async () => {
    repo.findOne.mockResolvedValue({ id: 1, deleted: false });
    assetRepo.count.mockResolvedValue(1);

    await expect(service.remove(1, 9)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({ where: { nature_id: 1, deleted: false } });
  });
});
