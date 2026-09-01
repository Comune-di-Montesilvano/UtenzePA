import { BadRequestException } from '@nestjs/common';
import { AssetAggregatorsService } from './asset-aggregators.service';
import { AssetAggregator } from './entity/asset-aggregator.entity';

describe('AssetAggregatorsService', () => {
  let service: AssetAggregatorsService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

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
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    };
    service = new AssetAggregatorsService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli aggregatori non cancellati di default', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('asset_aggregators.deleted = :deleted_default', {
        deleted_default: 0,
      });
    });

    it('rispetta il filtro deleted esplicito', async () => {
      await service.findAll({ deleted: true } as never);

      expect(qb.where).toHaveBeenCalledWith('asset_aggregators.deleted = :deleted_filter', {
        deleted_filter: 1,
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as AssetAggregator];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('asset_aggregators.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('create', () => {
    it('crea l\'aggregatore se il codice non è già utilizzato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({ code: 'AGG-1' } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'AGG-1' }));
      expect(result).toEqual(expect.objectContaining({ code: 'AGG-1' }));
    });

    it('lancia BadRequestException se il codice è già utilizzato', async () => {
      repo.findOne.mockResolvedValue({ id: 1, code: 'AGG-1' } as AssetAggregator);

      await expect(service.create({ code: 'AGG-1' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('aggiorna l\'aggregatore esistente', async () => {
      const entity = { id: 1, code: 'AGG-1' } as AssetAggregator;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { description: 'nuova descrizione' } as never, 2);

      expect(repo.save).toHaveBeenCalled();
    });

    it('lancia BadRequestException se l\'aggregatore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { code: 'AGG-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lancia BadRequestException se il nuovo codice è già presente su un altro aggregatore', async () => {
      const entity = { id: 1, code: 'AGG-1' } as AssetAggregator;
      repo.findOne
        .mockResolvedValueOnce(entity) // findOne(id)
        .mockResolvedValueOnce({ id: 2, code: 'AGG-2' } as AssetAggregator); // check duplicato codice

      await expect(service.update(1, { code: 'AGG-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('marca l\'aggregatore come cancellato', async () => {
      const entity = { id: 1, deleted: false } as AssetAggregator;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 3);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 3 }),
      );
    });

    it('usa 0 come updatedByUserId di default se non fornito', async () => {
      const entity = { id: 1, deleted: false } as AssetAggregator;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 0 }),
      );
    });
  });
});
