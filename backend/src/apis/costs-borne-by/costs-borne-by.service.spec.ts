import { CostsBorneByService } from './costs-borne-by.service';
import { CostsBorneBy } from '../shared/entities/utility_cost_borne_by.entity';

describe('CostsBorneByService', () => {
  let service: CostsBorneByService;
  let repo: { createQueryBuilder: jest.Mock };
  let qb: {
    where: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new CostsBorneByService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli elementi non cancellati', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('costs_borne_by.deleted = :deleted', {
        deleted: false,
      });
    });

    it('ordina per id ascendente', async () => {
      await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('costs_borne_by.id', 'ASC');
    });

    it('restituisce il risultato della query', async () => {
      const items = [{ id: 1 } as CostsBorneBy];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(result).toBe(items);
    });
  });
});
