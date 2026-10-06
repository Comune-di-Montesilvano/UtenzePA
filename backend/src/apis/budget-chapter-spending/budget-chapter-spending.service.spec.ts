import { BadRequestException } from '@nestjs/common';
import { BudgetChapterSpendingService } from './budget-chapter-spending.service';

describe('BudgetChapterSpendingService', () => {
  let service: BudgetChapterSpendingService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let chapterRepo: { findOne: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 99, ...data })),
    };
    chapterRepo = { findOne: jest.fn().mockResolvedValue({ id: 5, deleted: false }) };
    service = new BudgetChapterSpendingService(repo as never, chapterRepo as never);
  });

  it('elenca la spesa del capitolo dall’anno più recente', async () => {
    repo.find.mockResolvedValue([
      { id: 1, year: 2022, amount: '100.50' },
      { id: 2, year: 2024, amount: '300.00' },
      { id: 3, year: 2023, amount: '200.00' },
    ]);
    const rows = await service.findByChapter(5);
    expect(rows.map((r) => r.year)).toEqual([2024, 2023, 2022]);
    expect(rows[2].amount).toBe(100.5);
  });

  it('crea la spesa di un anno per il capitolo', async () => {
    await service.createForChapter(5, { year: 2024, amount: 1000 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        budget_chapter_id_fk: 5,
        year: 2024,
        amount: 1000,
        created_by_user_id: 3,
      }),
    );
  });

  it('rifiuta un secondo importo per lo stesso anno', async () => {
    repo.find.mockResolvedValue([{ id: 1, year: 2024, amount: '10.00' }]);
    await expect(service.createForChapter(5, { year: 2024, amount: 5 }, 3)).rejects.toThrow(/2024/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta un capitolo inesistente', async () => {
    chapterRepo.findOne.mockResolvedValue(null);
    await expect(service.createForChapter(5, { year: 2024, amount: 5 }, 3)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('modifica l’importo senza segnalare conflitto con sé stessa', async () => {
    repo.findOne.mockResolvedValue({
      id: 1,
      budget_chapter_id_fk: 5,
      year: 2024,
      amount: '10.00',
      deleted: false,
    });
    repo.find.mockResolvedValue([{ id: 1, year: 2024, amount: '10.00' }]);
    await service.update(1, { amount: 20 }, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, amount: 20 }));
  });

  it('rifiuta di spostare un importo su un anno già presente', async () => {
    repo.findOne.mockResolvedValue({
      id: 1,
      budget_chapter_id_fk: 5,
      year: 2023,
      amount: '10.00',
      deleted: false,
    });
    repo.find.mockResolvedValue([
      { id: 1, year: 2023, amount: '10.00' },
      { id: 2, year: 2024, amount: '10.00' },
    ]);
    await expect(service.update(1, { year: 2024 }, 3)).rejects.toThrow(/2024/);
  });

  it('crea un anno con il solo assestato', async () => {
    await service.createForChapter(5, { year: 2026, adjusted_budget: 28000 } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ budget_chapter_id_fk: 5, year: 2026, adjusted_budget: 28000 }),
    );
  });

  it('rifiuta un anno senza nessun importo', async () => {
    await expect(service.createForChapter(5, { year: 2026, notes: 'x' } as never, 3)).rejects.toThrow(
      'Indicare almeno un importo: stanziamento iniziale, assestato o spesa ragioneria.',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta una modifica che svuota tutti gli importi', async () => {
    repo.findOne.mockResolvedValue({ id: 1, budget_chapter_id_fk: 5, year: 2026, amount: null, adjusted_budget: '100.00' });
    await expect(service.update(1, { adjusted_budget: null } as never, 3)).rejects.toThrow(/almeno un importo/);
  });

  it('elenco: importi nulli restano null, gli altri diventano numeri', async () => {
    repo.find.mockResolvedValue([
      { id: 1, year: 2026, amount: null, initial_budget: '30000.00', adjusted_budget: '28000.00' },
    ]);
    const [row] = await service.findByChapter(5);
    expect(row.amount).toBeNull();
    expect(row.initial_budget).toBe(30000);
    expect(row.adjusted_budget).toBe(28000);
  });
});
