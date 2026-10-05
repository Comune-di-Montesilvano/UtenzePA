import { BadRequestException } from '@nestjs/common';
import { BudgetCommitmentsService } from './budget-commitments.service';

describe('BudgetCommitmentsService', () => {
  let service: BudgetCommitmentsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let contractRepo: { findOne: jest.Mock };
  let chapterRepo: { findOne: jest.Mock };
  let lineRepo: { count: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 50, ...d })),
    };
    contractRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, deleted: false }) };
    chapterRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, deleted: false }) };
    lineRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new BudgetCommitmentsService(
      repo as never,
      contractRepo as never,
      chapterRepo as never,
      lineRepo as never,
    );
  });

  it('elenca gli impegni del contratto dall’esercizio più recente, importo numerico', async () => {
    repo.find.mockResolvedValue([
      { id: 1, fiscal_year: 2025, amount: '100.00', budget_chapter_id_fk: 7 },
      { id: 2, fiscal_year: 2026, amount: null, budget_chapter_id_fk: 7 },
    ]);
    const rows = await service.findByContract(1);
    expect(rows.map((r) => r.fiscal_year)).toEqual([2026, 2025]);
    expect(rows[1].amount).toBe(100);
    expect(rows[0].amount).toBeNull();
  });

  it('crea un impegno sul contratto', async () => {
    await service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contract_id_fk: 1,
        budget_chapter_id_fk: 7,
        fiscal_year: 2026,
        created_by_user_id: 3,
      }),
    );
  });

  it('rifiuta un doppione contratto + capitolo + esercizio', async () => {
    repo.find.mockResolvedValue([{ id: 9, budget_chapter_id_fk: 7, fiscal_year: 2026 }]);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow('Impegno già presente per questo capitolo ed esercizio');
  });

  it('rifiuta contratto o capitolo inesistenti', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow(BadRequestException);
    contractRepo.findOne.mockResolvedValue({ id: 1 });
    chapterRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow('Capitolo non trovato');
  });

  it('modifica: il doppione si controlla escludendo se stesso', async () => {
    repo.findOne.mockResolvedValue({
      id: 9,
      contract_id_fk: 1,
      budget_chapter_id_fk: 7,
      fiscal_year: 2025,
      deleted: false,
    });
    repo.find.mockResolvedValue([{ id: 9, budget_chapter_id_fk: 7, fiscal_year: 2025 }]);
    await expect(service.update(9, { notes: 'x' }, 3)).resolves.toBeDefined();
    repo.find.mockResolvedValue([
      { id: 9, budget_chapter_id_fk: 7, fiscal_year: 2025 },
      { id: 10, budget_chapter_id_fk: 7, fiscal_year: 2026 },
    ]);
    await expect(service.update(9, { fiscal_year: 2026 }, 3)).rejects.toThrow(
      'Impegno già presente',
    );
  });

  it('non elimina un impegno usato da righe fattura (Review Focus 5)', async () => {
    repo.findOne.mockResolvedValue({ id: 9, deleted: false });
    lineRepo.count.mockResolvedValue(3);
    await expect(service.remove(9, 3)).rejects.toThrow('Impegno usato da 3 righe fattura');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('elimina (soft) un impegno non usato', async () => {
    repo.findOne.mockResolvedValue({ id: 9, deleted: false });
    await service.remove(9, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, deleted: true, updated_by_user_id: 3 }),
    );
  });
});
