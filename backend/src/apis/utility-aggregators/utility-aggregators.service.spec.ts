import { BadRequestException } from '@nestjs/common';
import { UtilityAggregatorsService } from './utility-aggregators.service';
import { UtilityAggregator } from './entity/utility-aggregator.entity';

describe('UtilityAggregatorsService', () => {
  let service: UtilityAggregatorsService;
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
    service = new UtilityAggregatorsService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli aggregatori non cancellati', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('utility_aggregators.deleted = :deleted', {
        deleted: false,
      });
    });

    it('applica ulteriori filtri se forniti', async () => {
      await service.findAll({ code: 'AGG-1' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('utility_aggregators.code LIKE :filter_code', {
        filter_code: '%AGG-1%',
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as UtilityAggregator];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('utility_aggregators.id', 'ASC');
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
      repo.findOne.mockResolvedValue({ id: 1, code: 'AGG-1' } as UtilityAggregator);

      await expect(service.create({ code: 'AGG-1' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('aggiorna l\'aggregatore quando il codice non cambia', async () => {
      const entity = { id: 1, code: 'AGG-1' } as UtilityAggregator;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { code: 'AGG-1' } as never, 2);

      expect(repo.save).toHaveBeenCalled();
    });

    it('lancia BadRequestException se l\'aggregatore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { code: 'AGG-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lancia BadRequestException se il nuovo codice è già presente su un altro aggregatore', async () => {
      const entity = { id: 1, code: 'AGG-1' } as UtilityAggregator;
      repo.findOne
        .mockResolvedValueOnce(entity) // findOne(id)
        .mockResolvedValueOnce({ id: 2, code: 'AGG-2' } as UtilityAggregator); // check duplicato codice

      await expect(service.update(1, { code: 'AGG-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('non verifica duplicati se il codice non è fornito nell\'update', async () => {
      const entity = { id: 1, code: 'AGG-1' } as UtilityAggregator;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { description: 'nuova descrizione' } as never, 2);

      expect(repo.save).toHaveBeenCalled();
    });
  });
});
