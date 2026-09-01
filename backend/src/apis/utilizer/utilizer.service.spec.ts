import { BadRequestException } from '@nestjs/common';
import { UtilizerService } from './utilizer.service';
import { Utilizer } from './entity/utilizer.entity';

describe('UtilizerService', () => {
  let service: UtilizerService;
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
    service = new UtilizerService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli utilizzatori non cancellati', async () => {
      await service.findAll({} as never);

      expect(qb.where).toHaveBeenCalledWith('Utilizer.deleted = :deleted', { deleted: false });
    });

    it('applica ulteriori filtri se forniti', async () => {
      await service.findAll({ name: 'Mario' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('Utilizer.name LIKE :filter_name', {
        filter_name: '%Mario%',
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as Utilizer];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll({} as never);

      expect(qb.orderBy).toHaveBeenCalledWith('Utilizer.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('findOne (ereditato da BaseService)', () => {
    it('restituisce l\'utilizzatore trovato', async () => {
      const entity = { id: 1 } as Utilizer;
      repo.findOne.mockResolvedValue(entity);

      const result = await service.findOne(1);

      expect(result).toBe(entity);
    });

    it('restituisce null se non trovato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('create (ereditato da BaseService)', () => {
    it('crea l\'utilizzatore', async () => {
      const result = await service.create({ name: 'Utilizzatore 1' } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Utilizzatore 1' }));
      expect(result).toEqual(expect.objectContaining({ name: 'Utilizzatore 1' }));
    });
  });

  describe('update (ereditato da BaseService)', () => {
    it('aggiorna l\'utilizzatore esistente', async () => {
      const entity = { id: 1, name: 'Utilizzatore 1' } as Utilizer;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { name: 'Utilizzatore 2' } as never, 2);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Utilizzatore 2', updated_by_user_id: 2 }),
      );
    });

    it('lancia BadRequestException se l\'utilizzatore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove (ereditato da BaseService)', () => {
    it('marca l\'utilizzatore come cancellato', async () => {
      const entity = { id: 1, deleted: false } as Utilizer;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 4);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 4 }),
      );
    });

    it('lancia BadRequestException se l\'utilizzatore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
