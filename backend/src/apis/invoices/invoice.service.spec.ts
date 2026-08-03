import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoice.service';
import { Invoice } from './entity/invoice.entity';
import { InvoiceBudgetChapter } from './entity/invoice_budget_chapter.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let budgetChapterRepo: object;
  let invoiceBudgetChapterRepo: object;
  let dataSource: { transaction: jest.Mock };
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    repo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    budgetChapterRepo = {};
    invoiceBudgetChapterRepo = {};
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    service = new InvoicesService(
      repo as never,
      budgetChapterRepo as never,
      invoiceBudgetChapterRepo as never,
      dataSource as never,
    );
  });

  describe('getMonthlyCosts', () => {
    it('somma il netto delle fatture del mese/anno corrente', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total_net_amount: '1234.56' }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMonthlyCosts();

      expect(result).toBe(1234.56);
    });

    it('restituisce 0 se non ci sono fatture nel mese', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total_net_amount: null }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMonthlyCosts();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('crea la fattura e i collegamenti ai capitoli di spesa in transazione', async () => {
      manager.findOne.mockResolvedValue({ id: 10 } as Invoice);

      const dto = {
        invoice_id: 'F-2026-001',
        invoice_date: '2026-01-15',
        budget_chapters: [1, 2],
      } as never;

      const result = await service.create(dto, 5);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        InvoiceBudgetChapter,
        expect.arrayContaining([
          expect.objectContaining({ budget_chapter_id: 1 }),
          expect.objectContaining({ budget_chapter_id: 2 }),
        ]),
      );
      expect(result).toEqual({ id: 10 });
    });

    it('non salva collegamenti se non ci sono budget_chapters', async () => {
      manager.findOne.mockResolvedValue({ id: 11 } as Invoice);

      await service.create({ invoice_id: 'F-2026-002', invoice_date: '2026-01-16' } as never, 5);

      expect(manager.save).toHaveBeenCalledTimes(1); // solo l'invoice, non i budget_chapters
    });

    it('rilancia un BadRequestException se il salvataggio dei capitoli fallisce', async () => {
      manager.save.mockImplementation((entity) => {
        if (entity === InvoiceBudgetChapter) {
          throw new Error('vincolo FK violato');
        }
        return Promise.resolve({ id: 12 });
      });

      await expect(
        service.create({ invoice_id: 'F-2026-003', invoice_date: '2026-01-17', budget_chapters: [1] } as never, 5),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('sostituisce i collegamenti ai capitoli di spesa quando forniti', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false } as Invoice);
      manager.findOne.mockResolvedValue({ id: 20 } as Invoice);

      await service.update(20, { budget_chapters: [3] } as never, 7);

      expect(manager.delete).toHaveBeenCalledWith(InvoiceBudgetChapter, { invoice_id: 20 });
      expect(manager.save).toHaveBeenCalledWith(
        InvoiceBudgetChapter,
        expect.arrayContaining([expect.objectContaining({ budget_chapter_id: 3 })]),
      );
    });
  });
});
