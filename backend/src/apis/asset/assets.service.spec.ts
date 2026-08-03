import { AssetsService } from './assets.service';
import { Asset } from './entity/asset.entity';

describe('AssetsService', () => {
  let service: AssetsService;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new AssetsService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli asset non cancellati di default', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('assets.deleted = :deleted_default', {
        deleted_default: 0,
      });
    });

    it('rispetta il filtro deleted esplicito', async () => {
      await service.findAll({ deleted: true } as never);

      expect(qb.where).toHaveBeenCalledWith('assets.deleted = :deleted_filter', {
        deleted_filter: 1,
      });
    });

    it('ordina per id ascendente', async () => {
      await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('assets.id', 'ASC');
    });

    it('restituisce il risultato della query', async () => {
      const assets = [{ id: 1 } as Asset];
      qb.getMany.mockResolvedValue(assets);

      const result = await service.findAll();

      expect(result).toBe(assets);
    });
  });

  describe('findOne', () => {
    it('filtra per id e restituisce un singolo asset', async () => {
      const asset = { id: 7 } as Asset;
      qb.getOne.mockResolvedValue(asset);

      const result = await service.findOne(7);

      expect(qb.where).toHaveBeenCalledWith('assets.id = :id', { id: 7 });
      expect(result).toBe(asset);
    });

    it('restituisce null se non trovato', async () => {
      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });
});
