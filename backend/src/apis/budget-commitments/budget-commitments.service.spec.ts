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
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let contractRepo: { find: jest.Mock };
  let chapterRepo: { findOne: jest.Mock };
  let reconcile: { reconcileSafe: jest.Mock };
  let manualLines = 0;
  let rows: Record<string, unknown>[] = [];
  let manualOrphans: { fiscal_year: number; n: number }[] = [];

  beforeEach(() => {
    manualLines = 0;
    rows = [];
    manualOrphans = [];
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 50, ...d })),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('/* c_manual */')) return [{ n: manualLines }];
        if (sql.includes('/* c_rows */')) return rows;
        if (sql.includes('/* c_manual_orphans */')) return manualOrphans;
        return [];
      }),
      manager: { transaction: jest.fn() },
    };
    // Transazione: stesse query del repository.
    repo.manager.transaction.mockImplementation(async (cb: (m: { query: jest.Mock }) => unknown) =>
      cb({ query: repo.query }),
    );
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

  const dto = { budget_chapter_id_fk: 7, years: [{ fiscal_year: 2026, amount: null }] };

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

  it('non elimina un impegno scelto a mano su fatture (quote MANUAL)', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 1 }] });
    manualLines = 2;
    await expect(service.remove(9, 3)).rejects.toThrow('Impegno scelto a mano su 2 fatture');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('elimina un impegno con sole quote automatiche e le riassegna', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 1 }] });
    await service.remove(9, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
  });

  it('contratto o capitolo cancellati già collegati non bloccano il salvataggio', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, contracts: [{ id: 1 }, { id: 2 }] });
    contractRepo.find.mockResolvedValue([
      { id: 1, deleted: false },
      { id: 2, deleted: true },
    ]);
    chapterRepo.findOne.mockResolvedValue(null);
    await expect(
      service.update(
        9,
        {
          years: [{ fiscal_year: 2026, amount: 50 }],
          budget_chapter_id_fk: 7,
          contract_ids: [1, 2],
        },
        3,
      ),
    ).resolves.toBeDefined();
  });

  it('collegare un contratto cancellato non ancora collegato è rifiutato', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, contracts: [{ id: 1 }] });
    contractRepo.find.mockResolvedValue([
      { id: 1, deleted: false },
      { id: 2, deleted: true },
    ]);
    await expect(service.update(9, { contract_ids: [1, 2] }, 3)).rejects.toThrow(
      'Contratto non trovato',
    );
  });

  it('ripristino: numero ancora libero, contratti ricalcolati', async () => {
    repo.findOne.mockImplementation(async () => ({
      id: 9,
      ...dto,
      commitment_year: 2026,
      commitment_num: 514,
      commitment_sub: 1,
      deleted: true,
      contracts: [{ id: 1 }],
    }));
    await service.update(9, { deleted: false, updated_by_user_id: 3 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, deleted: false, updated_by_user_id: 3 }),
    );
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
    repo.find.mockResolvedValue([{ id: 12 }]);
    await expect(service.update(9, { deleted: false }, 3)).rejects.toThrow(
      'Impegno 2026/514/1 già presente',
    );
  });

  it('elenco: speso, rimanenza ed etichetta calcolati', async () => {
    rows = [
      {
        id: 1,
        commitment_year: 2026,
        commitment_num: 514,
        commitment_sub: 1,
        spent: '30.00',
        contract_ids: '1,2',
        source: 'ACCOUNTING',
        years: JSON.stringify([
          { fiscal_year: 2027, amount: 40, spent: 0 },
          { fiscal_year: 2026, amount: 60, spent: 30 },
        ]),
      },
      {
        id: 2,
        commitment_year: null,
        commitment_num: null,
        commitment_sub: null,
        spent: '20.00',
        contract_ids: null,
        years: [{ fiscal_year: 2026, amount: null, spent: 20 }],
      },
    ];
    const list = await service.listRows({});
    expect(list[0]).toEqual(
      expect.objectContaining({
        label: '2026/514/1',
        amount: 100,
        spent: 30,
        remaining: 70,
        contract_ids: [1, 2],
        source: 'ACCOUNTING',
      }),
    );
    expect(list[0].years).toEqual([
      { fiscal_year: 2026, amount: 60, spent: 30, remaining: 30 },
      { fiscal_year: 2027, amount: 40, spent: 0, remaining: 40 },
    ]);
    expect(list[1]).toEqual(
      expect.objectContaining({ label: '—', remaining: null, contract_ids: [], source: 'MANUAL' }),
    );
  });

  it('quote a mano che bloccano l’eliminazione: fatture distinte, non cancellate e non rifiutate', async () => {
    repo.findOne.mockResolvedValue({ id: 9, ...dto, deleted: false, contracts: [{ id: 1 }] });
    await service.remove(9, 3).catch(() => undefined);
    const [sql, params] = repo.query.mock.calls.find(([s]) =>
      String(s).includes('/* c_manual */'),
    )!;
    expect(sql).toContain('FROM invoice_commitment_shares');
    expect(sql).toContain("source = 'MANUAL'");
    expect(sql).toContain('COUNT(DISTINCT');
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('sdi_status');
    expect(sql).not.toContain('invoice_lines');
    expect(params).toEqual([9]);
  });

  it('fatture dell’impegno: quote in ordine di consumo con progressivo', async () => {
    repo.query.mockImplementation(async (sql: string) =>
      sql.includes('/* c_invoices */')
        ? [
            {
              share_id: 5,
              invoice_id: 10,
              invoice_number: 'F-1',
              invoice_date: '2026-01-31',
              amount: '60.00',
              fiscal_year: 2026,
              source: 'AUTO',
            },
            {
              share_id: 6,
              invoice_id: 11,
              invoice_number: 'NC-1',
              invoice_date: new Date(2026, 1, 28),
              amount: '-10.50',
              fiscal_year: '2026',
              source: 'MANUAL',
            },
          ]
        : [],
    );
    expect(await service.invoices(9)).toEqual([
      {
        share_id: 5,
        invoice_id: 10,
        invoice_number: 'F-1',
        invoice_date: '2026-01-31',
        amount: 60,
        fiscal_year: 2026,
        source: 'AUTO',
        progressive: 60,
      },
      {
        share_id: 6,
        invoice_id: 11,
        invoice_number: 'NC-1',
        invoice_date: '2026-02-28',
        amount: -10.5,
        fiscal_year: 2026,
        source: 'MANUAL',
        progressive: 49.5,
      },
    ]);
    const [sql, params] = repo.query.mock.calls.find(([s]) =>
      String(s).includes('/* c_invoices */'),
    )!;
    expect(sql).toContain('FROM invoice_commitment_shares');
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('sdi_status');
    expect(sql).toMatch(/ORDER BY i\.invoice_date, i\.id/);
    expect(params).toEqual([9]);
  });

  it('elenco e speso senza GROUP_CONCAT (troncato oltre 1024 caratteri)', async () => {
    await service.listRows({});
    const sql = repo.query.mock.calls.find(([s]) =>
      String(s).includes('/* c_rows */'),
    )![0] as string;
    expect(sql).not.toContain('GROUP_CONCAT');
  });

  it('elenco: lo speso = quote di fatture non cancellate e non rifiutate', async () => {
    await service.listRows({});
    const sql = repo.query.mock.calls.find(([s]) =>
      String(s).includes('/* c_rows */'),
    )![0] as string;
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('sdi_status');
    expect(sql).toContain('FROM invoice_commitment_shares');
    expect(sql).toContain('s.fiscal_year = y.fiscal_year');
    expect(sql).not.toContain('invoice_lines');
  });

  it('un esercizio ripetuto nelle annualità è rifiutato', async () => {
    await expect(
      service.create(
        { budget_chapter_id_fk: 7, years: [{ fiscal_year: 2026 }, { fiscal_year: 2026 }] },
        3,
      ),
    ).rejects.toThrow('Esercizio ripetuto');
  });

  it('modifica delle annualità: sostituite in blocco, con audit', async () => {
    repo.findOne.mockResolvedValue({
      id: 9,
      budget_chapter_id_fk: 7,
      contracts: [{ id: 1 }],
      years: [{ fiscal_year: 2026, amount: '100.00' }],
    });
    await service.update(
      9,
      {
        years: [
          { fiscal_year: 2027, amount: 30 },
          { fiscal_year: 2026, amount: 100 },
        ],
      },
      3,
    );
    const insert = repo.query.mock.calls.find(([s]) => String(s).includes('/* c_years_insert */'))!;
    expect(insert[1]).toEqual([
      [
        [9, 2026, 100],
        [9, 2027, 30],
      ],
    ]);
    expect(repo.query.mock.calls.some(([s]) => String(s).includes('/* c_years_delete */'))).toBe(
      true,
    );
  });

  it('annualità invariate: nessuna scrittura', async () => {
    repo.findOne.mockResolvedValue({
      id: 9,
      budget_chapter_id_fk: 7,
      contracts: [{ id: 1 }],
      years: [{ fiscal_year: 2026, amount: '100.00' }],
    });
    await service.update(9, { years: [{ fiscal_year: 2026, amount: 100 }] }, 3);
    expect(repo.query.mock.calls.some(([s]) => String(s).includes('/* c_years_'))).toBe(false);
  });
  it('annualità tolta: le quote a mano passano alla più vicina, con audit; le altre non si toccano', async () => {
    repo.findOne.mockResolvedValue({
      id: 9,
      budget_chapter_id_fk: 7,
      contracts: [{ id: 1 }],
      years: [
        { fiscal_year: 2025, amount: '50.00' },
        { fiscal_year: 2026, amount: '100.00' },
      ],
    });
    manualOrphans = [{ fiscal_year: 2025, n: 2 }];
    const audit = jest.spyOn(service as never, 'recordAudit').mockResolvedValue(undefined as never);
    await service.update(
      9,
      {
        years: [
          { fiscal_year: 2026, amount: 100 },
          { fiscal_year: 2028, amount: 10 },
        ],
      },
      3,
    );
    const orphans = repo.query.mock.calls.find(([s]) =>
      String(s).includes('/* c_manual_orphans */'),
    )!;
    expect(orphans[0]).toContain("source = 'MANUAL'");
    expect(orphans[1]).toEqual([9, [2026, 2028]]);
    const move = repo.query.mock.calls.find(([s]) => String(s).includes('/* c_manual_move */'))!;
    expect(move[0]).toContain("source = 'MANUAL'");
    expect(move[1]).toEqual([2026, 9, 2025]);
    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      9,
      3,
      expect.arrayContaining([
        { fieldName: 'shares_moved', oldValue: '2025 (2 quote)', newValue: '2026' },
      ]),
    );
    expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
  });

  it('annualità tolta senza quote a mano: nessuno spostamento', async () => {
    repo.findOne.mockResolvedValue({
      id: 9,
      budget_chapter_id_fk: 7,
      contracts: [{ id: 1 }],
      years: [{ fiscal_year: 2025, amount: '50.00' }],
    });
    await service.update(9, { years: [{ fiscal_year: 2026, amount: 50 }] }, 3);
    expect(repo.query.mock.calls.some(([s]) => String(s).includes('/* c_manual_move */'))).toBe(
      false,
    );
  });
});

describe('BudgetCommitmentsService: import della contabilità attivo', () => {
  const LOCKED = "Con l'import della contabilità attivo questo dato arriva dalla contabilità.";
  const imported = () => ({
    id: 9,
    source: 'ACCOUNTING',
    commitment_year: 2026,
    commitment_num: 514,
    commitment_sub: 1,
    budget_chapter_id_fk: 7,
    supplier_id_fk: 3,
    notes: null,
    deleted: false,
    contracts: [{ id: 1 }],
    years: [{ fiscal_year: 2026, amount: '18500.00' }],
  });
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    query: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let service: BudgetCommitmentsService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(async () => imported()),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (d) => d),
      create: jest.fn((d) => d),
      query: jest.fn(async (sql: string) => (sql.includes('/* c_manual */') ? [{ n: 0 }] : [])),
      manager: {
        transaction: jest.fn(async (cb: (m: unknown) => unknown) =>
          cb({ query: jest.fn(async () => []) }),
        ),
      },
    };
    service = new BudgetCommitmentsService(
      repo as never,
      { find: jest.fn(async () => [{ id: 1 }, { id: 2 }]) } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 8, deleted: false }) } as never,
      { reconcileSafe: jest.fn() } as never,
      { isActive: jest.fn(async () => true) } as never,
    );
  });

  it('create = 400', async () => {
    await expect(
      service.create(
        { budget_chapter_id_fk: 7, years: [{ fiscal_year: 2026, amount: 1 }] } as never,
        3,
      ),
    ).rejects.toThrow(LOCKED);
  });

  it('capitolo, numero o fornitore diversi = 400', async () => {
    await expect(service.update(9, { budget_chapter_id_fk: 8 } as never, 3)).rejects.toThrow(
      LOCKED,
    );
    await expect(service.update(9, { commitment_num: 515 } as never, 3)).rejects.toThrow(LOCKED);
    await expect(service.update(9, { supplier_id_fk: 4 } as never, 3)).rejects.toThrow(LOCKED);
  });

  it('importi delle annualità diversi = 400', async () => {
    await expect(
      service.update(9, { years: [{ fiscal_year: 2026, amount: 18000 }] } as never, 3),
    ).rejects.toThrow(LOCKED);
  });

  it('form rimandato uguale con contratti e note cambiati = ammesso', async () => {
    await expect(
      service.update(
        9,
        {
          commitment_year: 2026,
          commitment_num: 514,
          commitment_sub: 1,
          budget_chapter_id_fk: 7,
          supplier_id_fk: 3,
          years: [{ fiscal_year: 2026, amount: 18500 }],
          contract_ids: [1, 2],
          notes: 'nota',
        } as never,
        3,
      ),
    ).resolves.not.toThrow();
  });

  it('delete = 400', async () => {
    await expect(service.remove(9, 3)).rejects.toThrow(LOCKED);
  });

  it('impegno a mano modificabile', async () => {
    repo.findOne.mockResolvedValue({ ...imported(), source: 'MANUAL' });
    await expect(service.update(9, { budget_chapter_id_fk: 8 } as never, 3)).resolves.not.toThrow();
  });
});
