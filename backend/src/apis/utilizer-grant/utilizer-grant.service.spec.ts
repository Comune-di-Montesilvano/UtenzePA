import { BadRequestException } from '@nestjs/common';
import { UtilizerGrantService } from './utilizer-grant.service';
import { UtilizerGrant } from './entity/utilizer-grant.entity';

describe('UtilizerGrantService', () => {
  let service: UtilizerGrantService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    };
    service = new UtilizerGrantService(repo as never);
  });

  describe('findAll', () => {
    it('filtra le sole concessioni non cancellate di default e fa il join con asset/utilizer', async () => {
      await service.findAll({} as never);

      expect(qb.where).toHaveBeenCalledWith('UtilizerGrant.deleted = :deleted_default', {
        deleted_default: 0,
      });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'UtilizerGrant.asset',
        'asset',
        'asset.deleted = 0',
      );
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'UtilizerGrant.utilizer',
        'utilizer',
        'utilizer.deleted = 0',
      );
    });

    it('rispetta il filtro deleted esplicito', async () => {
      await service.findAll({ deleted: true } as never);

      expect(qb.where).toHaveBeenCalledWith('UtilizerGrant.deleted = :deleted_filter', {
        deleted_filter: 1,
      });
    });

    it('applica il filtro sulla data di concessione', async () => {
      await service.findAll({ grant_date: '2026-01-01' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'DATE(UtilizerGrant.grant_date) = DATE(:grant_date)',
        { grant_date: '2026-01-01' },
      );
    });

    it('applica il filtro sulla data di scadenza', async () => {
      await service.findAll({ expire_date: '2026-12-31' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'DATE(UtilizerGrant.expire_date) = DATE(:expire_date)',
        { expire_date: '2026-12-31' },
      );
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as UtilizerGrant];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll({} as never);

      expect(qb.orderBy).toHaveBeenCalledWith('UtilizerGrant.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('create (ereditato da BaseService)', () => {
    it('crea la concessione', async () => {
      const result = await service.create(
        { asset_id_fk: 1, utilizer_id_fk: 2 } as never,
        1,
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ asset_id_fk: 1, utilizer_id_fk: 2 }),
      );
      expect(result).toEqual(expect.objectContaining({ asset_id_fk: 1 }));
    });
  });

  describe('update (ereditato da BaseService)', () => {
    it('aggiorna la concessione esistente', async () => {
      const entity = { id: 1, usage_type: 'A' } as UtilizerGrant;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { usage_type: 'B' } as never, 3);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ usage_type: 'B', updated_by_user_id: 3 }),
      );
    });

    it('lancia BadRequestException se la concessione non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { usage_type: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove (ereditato da BaseService)', () => {
    it('marca la concessione come cancellata', async () => {
      const entity = { id: 1, deleted: false } as UtilizerGrant;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 6);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 6 }),
      );
    });
  });
});
