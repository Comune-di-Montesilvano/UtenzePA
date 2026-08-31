import { BadRequestException } from '@nestjs/common';
import { PurposeService } from './purpose.service';
import { Purpose } from './entity/purpose.entity';

describe('PurposeService', () => {
  let service: PurposeService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let utilityTypePurposeRepo: { delete: jest.Mock };
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
    utilityTypePurposeRepo = { delete: jest.fn().mockResolvedValue(undefined) };
    service = new PurposeService(repo as never, utilityTypePurposeRepo as never);
  });

  describe('findAll', () => {
    it('filtra le sole finalità non cancellate', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('purpose.deleted = :deleted', { deleted: false });
    });

    it('applica il filtro LIKE su name', async () => {
      await service.findAll({ name: 'Illuminazione' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('purpose.name LIKE :name', {
        name: '%Illuminazione%',
      });
    });

    it('applica il filtro esatto su use_type', async () => {
      await service.findAll({ use_type: 'Pubblico' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('purpose.use_type = :use_type', {
        use_type: 'Pubblico',
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as Purpose];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('purpose.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('create (ereditato da BaseService)', () => {
    it('crea la finalità', async () => {
      const result = await service.create({ name: 'Finalità 1' } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Finalità 1' }));
      expect(result).toEqual(expect.objectContaining({ name: 'Finalità 1' }));
    });
  });

  describe('update (ereditato da BaseService)', () => {
    it('aggiorna la finalità esistente', async () => {
      const entity = { id: 1, name: 'Finalità 1' } as Purpose;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { name: 'Finalità 2' } as never, 2);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Finalità 2', updated_by_user_id: 2 }),
      );
    });
  });

  describe('remove', () => {
    it('elimina i collegamenti utility_type_purpose e marca la finalità come cancellata', async () => {
      const entity = { id: 1, deleted: false } as Purpose;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 5);

      expect(utilityTypePurposeRepo.delete).toHaveBeenCalledWith({ purpose_id: 1 });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 5 }),
      );
    });

    it('lancia BadRequestException se la finalità non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(BadRequestException);
      expect(utilityTypePurposeRepo.delete).not.toHaveBeenCalled();
    });
  });
});
