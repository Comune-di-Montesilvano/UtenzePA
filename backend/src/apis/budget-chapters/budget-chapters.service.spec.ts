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
    service = new BudgetChaptersService(repo as never);
  });

  describe('findAll', () => {
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

  describe('create (ereditato da BaseService)', () => {
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
});
