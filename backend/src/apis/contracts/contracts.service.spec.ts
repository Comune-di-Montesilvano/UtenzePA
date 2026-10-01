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
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('contract.consipAgreement', 'consipAgreement');
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

    it('registra un evento CREATE in audit log', async () => {
      manager.findOne.mockResolvedValue({ id: 10 } as Contract);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;

      await service.create({ cig_contract: 'CIG1' } as never, 5);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityName: 'contract', entityId: 10, action: 'CREATE', userId: 5 }),
      );
    });
  });

  describe('update', () => {
    it('sostituisce le associazioni alle utenze quando fornite', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false, cig_contract: 'CIG20' } as Contract);
      manager.findOne.mockResolvedValue({ id: 20 } as Contract);

      await service.update(20, { utility_ids: [3] } as never, 7);

      expect(manager.delete).toHaveBeenCalledWith(ContractUtility, { contract_id: 20 });
      expect(manager.save).toHaveBeenCalledWith(
        ContractUtility,
        expect.arrayContaining([expect.objectContaining({ utility_id: 3 })]),
      );
    });

    it('registra un evento UPDATE in audit log quando cambia un campo scalare', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false, cig_contract: 'OLD' } as Contract);
      manager.findOne.mockResolvedValue({ id: 20, cig_contract: 'NEW' } as Contract);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;

      await service.update(20, { cig_contract: 'NEW' } as never, 7);

      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityName: 'contract', entityId: 20, action: 'UPDATE', userId: 7 }),
      );
    });
  });

  describe('CIG univoco', () => {
    it('create: CIG già usato da un altro contratto (spazi/maiuscole) → 400 con il contratto in conflitto', async () => {
      qb.getMany.mockResolvedValueOnce([{ id: 9, cig_contract: 'abc123 ' }]);
      await expect(service.create({ cig_contract: ' ABC123', utility_ids: [] } as never, 1)).rejects.toThrow(/contratto 9/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('create: CIG che contiene un altro CIG senza coincidere → ammesso', async () => {
      qb.getMany.mockResolvedValueOnce([{ id: 9, cig_contract: 'ABC1234' }]);
      manager.save.mockImplementation(async (_e, data) => ({ id: 50, ...data }));
      manager.findOne.mockResolvedValue({ id: 50, updated_by_user_id: 1 });
      await expect(service.create({ cig_contract: 'ABC123', utility_ids: [] } as never, 1)).resolves.toMatchObject({ id: 50 });
    });

    it('update: il contratto stesso è escluso dal controllo', async () => {
      repo.findOne.mockResolvedValue({ id: 7, cig_contract: 'OLD' });
      await service.update(7, { cig_contract: 'NEW' } as never, 1).catch(() => undefined);
      expect(qb.andWhere).toHaveBeenCalledWith('c.id <> :excludeId', { excludeId: 7 });
    });

    it('CIG vuoto su contratto escluso: nessun controllo di unicità', async () => {
      manager.save.mockImplementation(async (_e, data) => ({ id: 51, ...data }));
      manager.findOne.mockResolvedValue({ id: 51, updated_by_user_id: 1 });
      await service.create({ cig_contract: '  ', cig_exempt: true, utility_ids: [] } as never, 1);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('CIG obbligatorio', () => {
    it('create senza CIG e non escluso → 400', async () => {
      await expect(service.create({ cig_contract: ' ', utility_ids: [] } as never, 1)).rejects.toThrow(/CIG obbligatorio/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('create senza CIG ma escluso → ammesso', async () => {
      manager.findOne.mockResolvedValue({ id: 60, updated_by_user_id: 1 });
      await expect(service.create({ cig_exempt: true, utility_ids: [] } as never, 1)).resolves.toMatchObject({ id: 60 });
    });

    it('update di un contratto senza CIG che non lo aggiunge → 400', async () => {
      repo.findOne.mockResolvedValue({ id: 30, cig_contract: null, cig_exempt: false });
      await expect(service.update(30, { order_number: 'X' } as never, 1)).rejects.toThrow(/CIG obbligatorio/);
    });

    it('update che rimuove il CIG da un contratto non escluso → 400', async () => {
      repo.findOne.mockResolvedValue({ id: 31, cig_contract: 'ABC', cig_exempt: false });
      await expect(service.update(31, { cig_contract: '' } as never, 1)).rejects.toThrow(/CIG obbligatorio/);
    });

    it('update di un contratto escluso senza CIG → ammesso', async () => {
      repo.findOne.mockResolvedValue({ id: 32, cig_contract: null, cig_exempt: true });
      manager.findOne.mockResolvedValue({ id: 32 });
      await expect(service.update(32, { order_number: 'X' } as never, 1)).resolves.toBeDefined();
    });
  });

  describe('filtro missing_cig', () => {
    it('solo contratti senza CIG e non esclusi', async () => {
      await service.findAll({ missing_cig: true } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(
        "TRIM(IFNULL(contract.cig_contract, '')) = '' AND contract.cig_exempt = 0",
      );
    });
  });
});
