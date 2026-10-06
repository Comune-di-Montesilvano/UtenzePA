import { BadRequestException } from '@nestjs/common';
import { BudgetChaptersService } from './budget-chapters.service';
import { BudgetChapter } from './entity/budgetChapter.entity';

describe('BudgetChaptersService', () => {
  let service: BudgetChaptersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let utilityRepo: { createQueryBuilder: jest.Mock };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
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
    utilityRepo = { createQueryBuilder: jest.fn() };
    service = new BudgetChaptersService(repo as never, utilityRepo as never);
  });

  describe('findAll', () => {
    it('con deleted=true elenca gli eliminati, senza ripetere deleted tra i filtri generici', async () => {
      await service.findAll({ deleted: true } as never);
      expect(qb.where).toHaveBeenCalledWith('budget_chapters.deleted = :deleted', { deleted: true });
      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('.deleted'), expect.anything());
    });

    it('filtra i soli capitoli non cancellati', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('budget_chapters.deleted = :deleted', {
        deleted: false,
      });
    });

    it('applica il filtro LIKE per i campi testuali configurati', async () => {
      await service.findAll({ chapter_code: '123' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('budget_chapters.chapter_code LIKE :chapter_code', {
        chapter_code: '%123%',
      });
    });

    it('applica il filtro esatto per gli altri campi', async () => {
      await service.findAll({ year: 2026 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('budget_chapters.year = :year', { year: 2026 });
    });

    it('carica i tipi utenza del capitolo (solo non cancellati)', async () => {
      await service.findAll();

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'budget_chapters.utilityTypes',
        'utilityTypes',
        'utilityTypes.deleted = 0',
      );
    });

    it('carica l’autore dell’ultima modifica (scheda aperta dalla riga)', async () => {
      await service.findAll();

      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('budget_chapters.updated_by', 'updated_by');
    });

    it('filtro tipo utenza: capitoli con quel tipo, senza filtrare i tipi caricati', async () => {
      await service.findAll({ utility_type_id: 36 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS (SELECT 1 FROM budget_chapter_utility_types'),
        { utility_type_id: 36 },
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith('budget_chapters.utility_type_id = :utility_type_id', expect.anything());
    });

    it('ignora i filtri undefined/null/stringa vuota', async () => {
      await service.findAll({ chapter_code: '', pdc: null, year: undefined } as never);

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as BudgetChapter];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('budget_chapters.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('findOne (ereditato da BaseService)', () => {
    it('restituisce il capitolo trovato', async () => {
      const entity = { id: 1 } as BudgetChapter;
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

  describe('create', () => {
    it('salva i tipi utenza indicati, senza doppioni', async () => {
      repo.findOne.mockResolvedValue({ id: 0 });

      await service.create({ chapter_code: 'CAP-1', utility_type_ids: [36, 35, 36] } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ utilityTypes: [{ id: 36 }, { id: 35 }] }),
      );
      expect(repo.save).not.toHaveBeenCalledWith(expect.objectContaining({ utility_type_ids: expect.anything() }));
    });

    it('crea il capitolo di spesa', async () => {
      const result = await service.create({ chapter_code: 'CAP-1' } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ chapter_code: 'CAP-1', created_by_user_id: 1 }),
      );
      expect(result).toEqual(expect.objectContaining({ chapter_code: 'CAP-1' }));
    });
  });

  describe('update (ereditato da BaseService)', () => {
    it('aggiorna il capitolo esistente', async () => {
      const entity = { id: 1, chapter_code: 'CAP-1' } as BudgetChapter;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { chapter_code: 'CAP-2' } as never, 2);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ chapter_code: 'CAP-2', updated_by_user_id: 2 }),
      );
    });

    it('sostituisce i tipi utenza se indicati', async () => {
      repo.findOne.mockResolvedValue({ id: 1, chapter_code: 'CAP-1', utilityTypes: [{ id: 35 }] });

      await service.update(1, { utility_type_ids: [36] } as never, 2);

      expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ utilityTypes: [{ id: 36 }] }));
    });

    it('lascia i tipi utenza invariati se non indicati', async () => {
      repo.findOne.mockResolvedValue({ id: 1, chapter_code: 'CAP-1', utilityTypes: [{ id: 35 }] });

      await service.update(1, { chapter_code: 'CAP-2' } as never, 2);

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ utilityTypes: [{ id: 35 }] }));
    });

    it('lancia BadRequestException se il capitolo non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { chapter_code: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove (ereditato da BaseService)', () => {
    it('marca il capitolo come cancellato', async () => {
      const entity = { id: 1, deleted: false } as BudgetChapter;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 5);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 5 }),
      );
    });

    it('lancia BadRequestException se il capitolo non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getConsumptionSummary', () => {
    it('raggruppa per tipo con unità e converte i SUM stringa', async () => {
      const summaryQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { hard_type: 'LIGHT', utilities_count: '3', estimated_sum: '1200.50', actual_sum: '900.00' },
          { hard_type: 'GAS', utilities_count: '1', estimated_sum: null, actual_sum: '0.00' },
        ]),
      };
      utilityRepo.createQueryBuilder.mockReturnValue(summaryQb);

      await expect(service.getConsumptionSummary(4)).resolves.toEqual([
        { hard_type: 'LIGHT', unit: 'kWh', utilities_count: 3, estimated_sum: 1200.5, actual_sum: 900 },
        { hard_type: 'GAS', unit: 'Smc', utilities_count: 1, estimated_sum: 0, actual_sum: 0 },
      ]);
      expect(summaryQb.andWhere).toHaveBeenCalledWith('u.budget_chapter_code_fk = :chapterId', { chapterId: 4 });
      expect(summaryQb.andWhere).toHaveBeenCalledWith('ut.hard_type <> :internet', { internet: 'INTERNET' });
    });
  });
});
