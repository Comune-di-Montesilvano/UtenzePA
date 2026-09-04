import { ContractsService } from './contracts.service';
import { Contract } from './entity/contract.entity';
import { ContractUtility } from './entity/contract-utility.entity';

describe('ContractsService', () => {
  let service: ContractsService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let contractUtilityRepo: object;
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    innerJoin: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), findOne: jest.fn() };
    contractUtilityRepo = {};
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new ContractsService(repo as never, contractUtilityRepo as never, dataSource as never);
  });

  describe('findAll', () => {
    it('filtra i soli contratti non cancellati e fa il join col fornitore e le utenze', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('contract.deleted = :deleted', { deleted: false });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('contract.supplier', 'supplier');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('contract.utilities', 'utilities');
    });

    it('filtra per utility_id (storico contratti di una utenza)', async () => {
      await service.findAll({ utility_id: 42 } as never);

      expect(qb.innerJoin).toHaveBeenCalledWith(
        'contract.utilities',
        'filtered_utility',
        'filtered_utility.id = :utilityId',
        { utilityId: 42 },
      );
    });
  });

  describe('create', () => {
    it('crea il contratto e le associazioni alle utenze in transazione', async () => {
      manager.findOne.mockResolvedValue({ id: 10 } as Contract);

      const result = await service.create({ cig_contract: 'CIG1', utility_ids: [1, 2] } as never, 5);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        ContractUtility,
        expect.arrayContaining([
          expect.objectContaining({ utility_id: 1 }),
          expect.objectContaining({ utility_id: 2 }),
        ]),
      );
      expect(result).toEqual({ id: 10 });
    });
  });

  describe('update', () => {
    it('sostituisce le associazioni alle utenze quando fornite', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false } as Contract);
      manager.findOne.mockResolvedValue({ id: 20 } as Contract);

      await service.update(20, { utility_ids: [3] } as never, 7);

      expect(manager.delete).toHaveBeenCalledWith(ContractUtility, { contract_id: 20 });
      expect(manager.save).toHaveBeenCalledWith(
        ContractUtility,
        expect.arrayContaining([expect.objectContaining({ utility_id: 3 })]),
      );
    });
  });
});
