import { BadRequestException } from '@nestjs/common';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { commitmentLabel } from './commitment-label';

describe('commitmentLabel', () => {
  it('anno/num/sub, trattino lungo senza numero', () => {
    expect(commitmentLabel(2026, 514, 1)).toBe('2026/514/1');
    expect(commitmentLabel(null, null, null)).toBe('—');
  });
});

describe('BudgetCommitmentsService', () => {
  let service: BudgetCommitmentsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; query: jest.Mock };
  let contractRepo: { find: jest.Mock };
  let chapterRepo: { findOne: jest.Mock };
  let reconcile: { reconcileSafe: jest.Mock };
  let manualLines = 0;
  let rows: Record<string, unknown>[] = [];

  beforeEach(() => {
    manualLines = 0;
    rows = [];
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 50, ...d })),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('/* c_manual */')) return [{ n: manualLines }];
        if (sql.includes('/* c_rows */')) return rows;
        return [];
      }),
    };
    contractRepo = { find: jest.fn(async () => [{ id: 1 }, { id: 2 }]) };
    chapterRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, deleted: false }) };
    reconcile = { reconcileSafe: jest.fn().mockResolvedValue(undefined) };
    service = new BudgetCommitmentsService(
      repo as never,
      contractRepo as never,
      chapterRepo as never,
      reconcile as never,
    );
  });

  const dto = { budget_chapter_id_fk: 7, fiscal_year: 2026 };

  it('crea un impegno con i contratti e ricalcola il loro consumo', async () => {
    await service.create(
      { ...dto, commitment_year: 2026, commitment_num: 514, contract_ids: [1, 2] },
      3,
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        commitment_year: 2026,
        commitment_num: 514,
        commitment_sub: 1,
        contracts: [{ id: 1 }, { id: 2 }],
        created_by_user_id: 3,
      }),
    );
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1, 2]);
  });

  it('rifiuta un numero impegno già presente', async () => {
    repo.find.mockResolvedValue([{ id: 9 }]);
    await expect(
      service.create({ ...dto, commitment_year: 2026, commitment_num: 514, commitment_sub: 1 }, 3),
    ).rejects.toThrow('Impegno 2026/514/1 già presente');
  });

  it('anno e numero impegno vanno insieme', async () => {
    await expect(service.create({ ...dto, commitment_year: 2026 }, 3)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rifiuta contratti inesistenti', async () => {
    contractRepo.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.create({ ...dto, contract_ids: [1, 2] }, 3)).rejects.toThrow(
      'Contratto non trovato',
    );
  });

  it('modifica dei contratti: ricalcola vecchi e nuovi', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 5 }] });
    contractRepo.find.mockResolvedValue([{ id: 1 }]);
    await service.update(9, { contract_ids: [1] }, 3);
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([5, 1]);
  });

  it('non elimina un impegno scelto a mano su righe di fattura', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 1 }] });
    manualLines = 2;
    await expect(service.remove(9, 3)).rejects.toThrow('Impegno scelto a mano su 2 righe fattura');
  });

  it('elimina un impegno con sole righe automatiche e le riassegna', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 1 }] });
    await service.remove(9, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
  });

  it('contratto o capitolo cancellati già collegati non bloccano il salvataggio', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, contracts: [{ id: 1 }, { id: 2 }] });
    contractRepo.find.mockResolvedValue([{ id: 1, deleted: false }, { id: 2, deleted: true }]);
    chapterRepo.findOne.mockResolvedValue(null);
    await expect(
      service.update(9, { amount: 50, budget_chapter_id_fk: 7, contract_ids: [1, 2] }, 3),
    ).resolves.toBeDefined();
  });

  it('collegare un contratto cancellato non ancora collegato è rifiutato', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, contracts: [{ id: 1 }] });
    contractRepo.find.mockResolvedValue([{ id: 1, deleted: false }, { id: 2, deleted: true }]);
    await expect(service.update(9, { contract_ids: [1, 2] }, 3)).rejects.toThrow('Contratto non trovato');
  });

  it('ripristino: numero ancora libero, contratti ricalcolati', async () => {
    repo.findOne.mockImplementation(async () => ({
      id: 9, ...dto, commitment_year: 2026, commitment_num: 514, commitment_sub: 1,
      deleted: true, contracts: [{ id: 1 }],
    }));
    await service.update(9, { deleted: false, updated_by_user_id: 3 }, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9, deleted: false, updated_by_user_id: 3 }));
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
    repo.find.mockResolvedValue([{ id: 12 }]);
    await expect(service.update(9, { deleted: false }, 3)).rejects.toThrow('Impegno 2026/514/1 già presente');
  });

  it('elenco: speso, rimanenza ed etichetta calcolati', async () => {
    rows = [
      { id: 1, commitment_year: 2026, commitment_num: 514, commitment_sub: 1, amount: '100.00', spent: '30.00', contract_ids: '1,2' },
      { id: 2, commitment_year: null, commitment_num: null, commitment_sub: null, amount: null, spent: '20.00', contract_ids: null },
    ];
    const list = await service.listRows({});
    expect(list[0]).toEqual(
      expect.objectContaining({ label: '2026/514/1', amount: 100, spent: 30, remaining: 70, contract_ids: [1, 2] }),
    );
    expect(list[1]).toEqual(expect.objectContaining({ label: '—', remaining: null, contract_ids: [] }));
  });

  it('elenco: lo speso conta solo fatture non cancellate e non rifiutate', async () => {
    await service.listRows({});
    const sql = repo.query.mock.calls.find(([s]) => String(s).includes('/* c_rows */'))![0] as string;
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('sdi_status');
  });
});
