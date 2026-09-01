import { BadRequestException } from '@nestjs/common';
import { MaintenanceManagersService } from './maintenance-managers.service';
import { MaintenanceManager } from '../shared/entities/maintenanceManagers.entity';

describe('MaintenanceManagersService', () => {
  let service: MaintenanceManagersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    };
    service = new MaintenanceManagersService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli elementi non cancellati di default', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('maintenance-managers.deleted = :deleted', {
        deleted: false,
      });
    });

    it('applica il filtro LIKE su code se fornito', async () => {
      await service.findAll({ code: '  ABC  ' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('maintenance-managers.code LIKE :code', {
        code: '%ABC%',
      });
    });

    it('applica il filtro LIKE su description se fornito', async () => {
      await service.findAll({ description: 'manutenzione' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'maintenance-managers.description LIKE :description',
        { description: '%manutenzione%' },
      );
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as MaintenanceManager];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('maintenance-managers.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('findOne', () => {
    it('restituisce l\'elemento trovato', async () => {
      const entity = { id: 5 } as MaintenanceManager;
      repo.findOne.mockResolvedValue(entity);

      const result = await service.findOne(5);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(result).toBe(entity);
    });

    it('restituisce null se non trovato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('crea il gestore manutenzione se il codice non è già usato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create({ code: 'MGR-1' } as never, 7);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'MGR-1', created_by_user_id: 7, updated_by_user_id: 7 }),
      );
      expect(result).toEqual(
        expect.objectContaining({ code: 'MGR-1', created_by_user_id: 7, updated_by_user_id: 7 }),
      );
    });

    it('lancia BadRequestException se il codice è già utilizzato', async () => {
      repo.findOne.mockResolvedValue({ id: 1, code: 'MGR-1' } as MaintenanceManager);

      await expect(service.create({ code: 'MGR-1' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('aggiorna il gestore manutenzione esistente', async () => {
      const entity = { id: 1, code: 'MGR-1', description: 'vecchia' } as MaintenanceManager;
      repo.findOne.mockResolvedValue(entity);

      const result = await service.update(1, { description: 'nuova' } as never, 9);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, description: 'nuova', updated_by_user_id: 9 }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 1, description: 'nuova', updated_by_user_id: 9 }),
      );
    });

    it('lancia BadRequestException se il gestore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { description: 'x' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lancia BadRequestException se il nuovo codice è già usato da un altro elemento', async () => {
      const entity = { id: 1, code: 'MGR-1' } as MaintenanceManager;
      repo.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValueOnce({ id: 2, code: 'MGR-2' } as MaintenanceManager);

      await expect(service.update(1, { code: 'MGR-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('permette di aggiornare mantenendo lo stesso codice', async () => {
      const entity = { id: 1, code: 'MGR-1' } as MaintenanceManager;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { code: 'MGR-1' } as never, 3);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'MGR-1' }));
    });
  });

  describe('remove', () => {
    it('marca l\'elemento come cancellato', async () => {
      const entity = { id: 1, deleted: false } as MaintenanceManager;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 4);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 4 }),
      );
    });

    it('lancia BadRequestException se l\'elemento non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 4)).rejects.toThrow(BadRequestException);
    });
  });
});
