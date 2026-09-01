import { UtilityTypesService } from './utility-types.service';
import { UtilityType } from './entity/utility_type.entity';
import { UtilityTypePurpose } from './entity/utility_type_purpose.entity';

describe('UtilityTypesService', () => {
  let service: UtilityTypesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let utilityTypePurposeRepo: object;
  let dataSource: { transaction: jest.Mock };
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      delete: jest.fn(),
    };
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), findOne: jest.fn() };
    utilityTypePurposeRepo = {};
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    service = new UtilityTypesService(
      repo as never,
      utilityTypePurposeRepo as never,
      dataSource as never,
    );
  });

  describe('findAll', () => {
    it('filtra i soli tipi non cancellati di default e fa il join con le finalità', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('utility_types.deleted = :deleted', {
        deleted: false,
      });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'utility_types.purposes',
        'purpose',
        'purpose.deleted = 0',
      );
    });

    it('applica il filtro LIKE su name/description', async () => {
      await service.findAll({ name: 'Energia' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('utility_types.name LIKE :name', {
        name: '%Energia%',
      });
    });

    it('applica il filtro esatto su hard_type', async () => {
      await service.findAll({ hard_type: 'hard' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('utility_types.hard_type = :hard_type', {
        hard_type: 'hard',
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as UtilityType];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('utility_types.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('create', () => {
    it('crea il tipo utenza e i collegamenti alle finalità in transazione', async () => {
      const created = { id: 10, name: 'Energia elettrica' } as UtilityType;
      repo.findOne.mockResolvedValue(created);

      const dto = { name: 'Energia elettrica', hard_type: 'hard', purposes: [1, 2] } as never;

      const result = await service.create(dto, 5);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        UtilityTypePurpose,
        expect.arrayContaining([
          expect.objectContaining({ purpose_id: 1 }),
          expect.objectContaining({ purpose_id: 2 }),
        ]),
      );
      expect(result).toBe(created);
    });

    it('non salva collegamenti se non ci sono finalità', async () => {
      repo.findOne.mockResolvedValue({ id: 11 } as UtilityType);

      await service.create({ name: 'Gas', hard_type: 'hard' } as never, 5);

      expect(manager.save).toHaveBeenCalledTimes(1); // solo l'entità, non le finalità
    });

    it('rilancia un errore gestito se il salvataggio fallisce', async () => {
      manager.save.mockImplementation((entity) => {
        if (entity === UtilityType) {
          throw new Error('vincolo violato');
        }
        return Promise.resolve({ id: 12 });
      });

      await expect(
        service.create({ name: 'Acqua', hard_type: 'hard' } as never, 5),
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('sostituisce i collegamenti alle finalità quando forniti', async () => {
      const entity = { id: 20, name: 'Energia elettrica' } as UtilityType;
      repo.findOne.mockResolvedValue(entity);

      await service.update(20, { purposes: [3] } as never, 7);

      expect(manager.delete).toHaveBeenCalledWith(UtilityTypePurpose, { utility_type_id: 20 });
      expect(manager.save).toHaveBeenCalledWith(
        UtilityTypePurpose,
        expect.arrayContaining([expect.objectContaining({ purpose_id: 3 })]),
      );
    });

    it('non tocca i collegamenti se purposes non è fornito', async () => {
      const entity = { id: 20, name: 'Energia elettrica' } as UtilityType;
      repo.findOne.mockResolvedValue(entity);

      await service.update(20, { name: 'Nuovo nome' } as never, 7);

      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('lancia un errore se il tipo utenza non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' } as never)).rejects.toThrow();
    });
  });
});
