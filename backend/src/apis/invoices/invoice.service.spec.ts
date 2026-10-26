import { SdiStatus } from './enum/sdi-status.enum';
import { InvoicesService } from './invoice.service';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { SdiMessage } from '@apis/invoice-import/entity/sdi-message.entity';
import { In } from 'typeorm';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { InvoiceCommitmentShare } from './entity/invoice-commitment-share.entity';
import { CommitmentShareSource } from './entity/commitment-share-source.enum';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let contractRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let linker: { follow: jest.Mock; unlink: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };
  let reconcile: { reconcileSafe: jest.Mock };
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
    count: jest.Mock;
  };

  beforeEach(() => {
    manager = {
      create: jest.fn((_e, data) => data),
      save: jest.fn(async (_e, data) => (Array.isArray(data) ? data : { id: 10, ...data })),
      findOne: jest.fn().mockResolvedValue({ id: 10 }),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    repo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    contractRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, supplier_id_fk: 44 }) };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    linker = { follow: jest.fn().mockResolvedValue([]), unlink: jest.fn().mockResolvedValue([]) };
    recalc = { recalcUtility: jest.fn() };
    reconcile = { reconcileSafe: jest.fn().mockResolvedValue(undefined) };
    service = new InvoicesService(
      repo as never,
      contractRepo as never,
      dataSource as never,
      linker as never,
      recalc as never,
      reconcile as never,
    );
  });

  describe('create', () => {
    it('salva testata e righe in transazione, fornitore preso dal contratto', async () => {
      await service.create(
        {
          invoice_id: 'F-1',
          invoice_date: '2025-03-15',
          contratto_id_fk: 1,
          lines: [{ amount: 10 }, { amount: 2 }],
        } as never,
        3,
      );
      expect(manager.save).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({ supplier_id_fk: 44 }),
      );
      const rows = manager.save.mock.calls.find(([e]) => e === InvoiceLine)[1];
      expect(rows).toEqual([
        expect.objectContaining({ invoice_id_fk: 10, amount: 10 }),
        expect.objectContaining({ amount: 2 }),
      ]);
      // Le righe non portano più l'impegno: lo dicono le quote.
      for (const r of rows) {
        expect(r).not.toHaveProperty('commitment_id_fk');
        expect(r).not.toHaveProperty('commitment_auto');
      }
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceCommitmentShare, expect.anything());
      expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
    });

    it('rifiuta un periodo con fine prima dell’inizio', async () => {
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2025-03-15',
            lines: [{ amount: 1, period_start: '2025-03-01', period_end: '2025-02-01' }],
          } as never,
          3,
        ),
      ).rejects.toThrow('Riga 1: la fine del periodo è prima dell’inizio');
    });

    it('nota di credito: imponibile negativo ammesso solo con totale negativo', async () => {
      await expect(
        service.create(
          {
            invoice_id: 'NC-1',
            invoice_date: '2026-06-29',
            total_amount: -23.52,
            net_amount_excl_vat: -19.28,
          } as never,
          3,
        ),
      ).resolves.toBeDefined();
      for (const total_amount of [10, null]) {
        await expect(
          service.create(
            {
              invoice_id: 'F-2',
              invoice_date: '2026-06-29',
              total_amount,
              net_amount_excl_vat: -5,
            } as never,
            3,
          ),
        ).rejects.toThrow('nota di credito');
      }
    });

    it('registra un evento CREATE in audit log', async () => {
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.create({ invoice_id: 'F-4', invoice_date: '2026-01-18' } as never, 5);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityName: 'Invoice',
          entityId: 10,
          action: 'CREATE',
          userId: 5,
        }),
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: 20,
        invoice_id: 'OLD',
        contratto_id_fk: 1,
        deleted: false,
      });
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'OLD', contratto_id_fk: 1 });
    });

    it('PATCH del solo imponibile negativo: vale il totale già salvato', async () => {
      repo.findOne.mockResolvedValue({
        id: 20,
        invoice_id: 'NC',
        total_amount: '-90.79',
        deleted: false,
      });
      await expect(
        service.update(20, { net_amount_excl_vat: -74.42 } as never, 7),
      ).resolves.toBeDefined();
      repo.findOne.mockResolvedValue({
        id: 20,
        invoice_id: 'F',
        total_amount: '90.79',
        deleted: false,
      });
      await expect(service.update(20, { net_amount_excl_vat: -74.42 } as never, 7)).rejects.toThrow(
        'nota di credito',
      );
    });

    it('senza lines non tocca le righe (Review Focus 2)', async () => {
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
    });

    it('con lines sostituisce le righe in blocco', async () => {
      await service.update(20, { lines: [{ amount: 5 }] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 20 });
      expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [
        expect.objectContaining({ invoice_id_fk: 20, amount: 5 }),
      ]);
    });

    it('righe reinviate: le rilevazioni dei consumi seguono le righe, utenze ricalcolate', async () => {
      const previous = [{ id: 1, invoice_id_fk: 20, consumption_id_fk: 70 }];
      manager.find.mockResolvedValue(previous);
      linker.follow.mockResolvedValue([812]);
      await service.update(20, { lines: [{ amount: 5 }] } as never, 7);
      expect(linker.follow).toHaveBeenCalledWith(manager, 20, previous);
      expect(recalc.recalcUtility).toHaveBeenCalledWith(812);
    });

    it('senza lines le rilevazioni non si toccano', async () => {
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      expect(linker.follow).not.toHaveBeenCalled();
    });

    it('lines vuoto cancella tutte le righe', async () => {
      await service.update(20, { lines: [] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 20 });
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
    });

    it('fattura nata o arricchita dall’import: la modifica a mano la blocca', async () => {
      manager.count.mockResolvedValue(1);
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      expect(manager.count).toHaveBeenCalledWith(SdiMessage, { where: { invoice_id_fk: 20 } });
      expect(manager.save).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({ import_locked: true }),
      );
    });

    it('fattura non importata: import_locked non toccato', async () => {
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      const saved = manager.save.mock.calls.find(([e]) => e === Invoice)[1];
      expect(saved).not.toHaveProperty('import_locked');
    });

    it('registra in audit il numero di righe prima/dopo', async () => {
      manager.find.mockResolvedValue([{ amount: '1.00' }, { amount: '2.00' }, { amount: '3.00' }]);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(20, { lines: [{ amount: 5 }] } as never, 7);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ fieldName: 'lines', oldValue: 3, newValue: 1 }),
          ]),
        }),
      );
    });
  });

  describe('remove', () => {
    it('eliminando la fattura si tolgono i suoi consumi e le utenze si ricalcolano', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false });
      (repo as unknown as { save: jest.Mock }).save = jest.fn();
      linker.unlink.mockResolvedValue([812]);
      await service.remove(20, 7);
      expect(linker.unlink).toHaveBeenCalledWith(manager, 20);
      expect(recalc.recalcUtility).toHaveBeenCalledWith(812);
    });
  });

  describe('quote d’impegno a mano', () => {
    const commitment = (over: Record<string, unknown> = {}) => ({
      id: 5,
      commitment_year: 2025,
      commitment_num: 12,
      commitment_sub: 1,
      contracts: [{ id: 3 }, { id: 1 }],
      years: [{ fiscal_year: 2025 }, { fiscal_year: 2026 }],
      ...over,
    });
    // find per entità: impegni, righe salvate, quote già salvate.
    const finds = (data: { commitments?: unknown[]; lines?: unknown[]; shares?: unknown[] }) =>
      manager.find.mockImplementation(async (entity: unknown) => {
        if (entity === BudgetCommitment) return data.commitments ?? [];
        if (entity === InvoiceLine) return data.lines ?? [];
        if (entity === InvoiceCommitmentShare) return data.shares ?? [];
        return [];
      });
    const savedShares = () =>
      manager.save.mock.calls.find(([e]) => e === InvoiceCommitmentShare)?.[1];

    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: 20,
        invoice_id: 'F',
        invoice_date: '2026-04-01',
        contratto_id_fk: 1,
        deleted: false,
      });
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 1 });
    });

    it('create: quote salvate MANUAL con l’esercizio indicato', async () => {
      finds({ commitments: [commitment()] });
      await service.create(
        {
          invoice_id: 'F-1',
          invoice_date: '2026-03-15',
          contratto_id_fk: 1,
          commitment_shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10 }],
        } as never,
        3,
      );
      expect(savedShares()).toEqual([
        {
          invoice_id_fk: 10,
          commitment_id_fk: 5,
          fiscal_year: 2026,
          amount: 10,
          source: CommitmentShareSource.MANUAL,
        },
      ]);
    });

    it('esercizio omesso: annualità per la competenza della fattura (periodo delle righe)', async () => {
      finds({ commitments: [commitment()] });
      await service.create(
        {
          invoice_id: 'F-1',
          invoice_date: '2026-01-20',
          contratto_id_fk: 1,
          lines: [
            { amount: 4, period_start: '2025-10-01', period_end: '2025-11-30' },
            { amount: 6, period_start: '2025-11-01', period_end: '2025-12-31' },
          ],
          commitment_shares: [{ commitment_id_fk: 5, amount: 10 }],
        } as never,
        3,
      );
      expect(savedShares()).toEqual([expect.objectContaining({ fiscal_year: 2025 })]);
    });

    it('update senza righe nel payload: competenza dalle righe salvate', async () => {
      finds({
        commitments: [commitment({ years: [{ fiscal_year: 2024 }, { fiscal_year: 2025 }] })],
        lines: [{ amount: '10.00', period_start: '2025-01-01', period_end: '2025-03-31' }],
      });
      await service.update(
        20,
        { commitment_shares: [{ commitment_id_fk: 5, amount: 10 }] } as never,
        7,
      );
      expect(savedShares()).toEqual([
        expect.objectContaining({
          invoice_id_fk: 20,
          fiscal_year: 2025,
          source: CommitmentShareSource.MANUAL,
        }),
      ]);
    });

    it('esercizio non tra le annualità dell’impegno: 400', async () => {
      finds({ commitments: [commitment()] });
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2026-03-15',
            contratto_id_fk: 1,
            commitment_shares: [{ commitment_id_fk: 5, fiscal_year: 2027, amount: 10 }],
          } as never,
          3,
        ),
      ).rejects.toThrow("L'impegno 2025/12/1 non ha l'esercizio 2027");
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('impegno di un altro contratto: 400 riferito alla quota', async () => {
      finds({ commitments: [commitment(), commitment({ id: 6, contracts: [{ id: 2 }] })] });
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2026-03-15',
            contratto_id_fk: 1,
            commitment_shares: [
              { commitment_id_fk: 5, fiscal_year: 2026, amount: 4 },
              { commitment_id_fk: 6, fiscal_year: 2026, amount: 6 },
            ],
          } as never,
          3,
        ),
      ).rejects.toThrow("L'impegno della quota 2 non è del contratto della fattura");
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('impegno inesistente o cancellato: 400', async () => {
      finds({ commitments: [] });
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2026-03-15',
            contratto_id_fk: 1,
            commitment_shares: [{ commitment_id_fk: 99, amount: 10 }],
          } as never,
          3,
        ),
      ).rejects.toThrow("L'impegno della quota 1 non esiste");
    });

    it('fattura senza contratto: 400', async () => {
      finds({ commitments: [commitment()] });
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2026-03-15',
            commitment_shares: [{ commitment_id_fk: 5, amount: 10 }],
          } as never,
          3,
        ),
      ).rejects.toThrow("Le quote d'impegno richiedono un contratto sulla fattura");
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('lista: sostituisce le quote AUTO e MANUAL nella stessa transazione', async () => {
      finds({ commitments: [commitment()] });
      await service.update(
        20,
        { commitment_shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10 }] } as never,
        7,
      );
      expect(manager.delete).toHaveBeenCalledWith(InvoiceCommitmentShare, {
        invoice_id_fk: 20,
        source: In([CommitmentShareSource.AUTO, CommitmentShareSource.MANUAL]),
      });
      expect(savedShares()).toHaveLength(1);
    });

    it('[] cancella le quote MANUAL e chiama il ricalcolo', async () => {
      finds({ shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10, source: 'MANUAL' }] });
      await service.update(20, { commitment_shares: [] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceCommitmentShare, {
        invoice_id_fk: 20,
        source: CommitmentShareSource.MANUAL,
      });
      expect(savedShares()).toBeUndefined();
      expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
    });

    it('PATCH commitment_shares su fattura con quote ACCOUNTING = 400', async () => {
      manager.count.mockImplementation(async (entity: unknown) =>
        entity === InvoiceCommitmentShare ? 1 : 0,
      );
      await expect(service.update(20, { commitment_shares: [] } as never, 7)).rejects.toThrow(
        'Le quote della ragioneria non si modificano.',
      );
      expect(manager.delete).not.toHaveBeenCalledWith(InvoiceCommitmentShare, expect.anything());
    });

    it('quote assenti nel payload: invariate', async () => {
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      expect(manager.delete).not.toHaveBeenCalledWith(InvoiceCommitmentShare, expect.anything());
      expect(savedShares()).toBeUndefined();
    });

    it('audit commitment_shares solo se le quote cambiano', async () => {
      finds({
        commitments: [commitment()],
        shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10, source: 'MANUAL' }],
      });
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(
        20,
        { commitment_shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10 }] } as never,
        7,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();

      await service.update(
        20,
        {
          commitment_shares: [
            { commitment_id_fk: 5, fiscal_year: 2026, amount: 4 },
            { commitment_id_fk: 5, fiscal_year: 2025, amount: 6 },
          ],
        } as never,
        7,
      );
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [
            expect.objectContaining({ fieldName: 'commitment_shares', oldValue: 1, newValue: 2 }),
          ],
        }),
      );
    });

    it('cambio contratto con quote a mano di un altro contratto, quote non inviate: 400', async () => {
      finds({
        commitments: [commitment({ contracts: [{ id: 1 }] })],
        shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10, source: 'MANUAL' }],
      });
      await expect(service.update(20, { contratto_id_fk: 2 } as never, 7)).rejects.toThrow(
        "Le quote d'impegno sono di un altro contratto: aggiornale nel tab Impegni",
      );
      await expect(service.update(20, { contratto_id_fk: null } as never, 7)).rejects.toThrow(
        "Le quote d'impegno sono di un altro contratto: aggiornale nel tab Impegni",
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('cambio contratto: quote a mano su impegno condiviso col nuovo contratto restano', async () => {
      finds({
        commitments: [commitment({ contracts: [{ id: 1 }, { id: 2 }] })],
        shares: [{ commitment_id_fk: 5, fiscal_year: 2026, amount: 10, source: 'MANUAL' }],
      });
      await expect(service.update(20, { contratto_id_fk: 2 } as never, 7)).resolves.toBeDefined();
      expect(manager.delete).not.toHaveBeenCalledWith(InvoiceCommitmentShare, expect.anything());
    });

    it('cambio contratto senza quote a mano: ricalcolo su vecchio e nuovo', async () => {
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 2 });
      await service.update(20, { contratto_id_fk: 2 } as never, 7);
      expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1, 2]);
    });

    it('eliminando la fattura si ricalcola il consumo degli impegni del contratto', async () => {
      repo.findOne.mockResolvedValue({ id: 20, contratto_id_fk: 4, deleted: false });
      (repo as unknown as { save: jest.Mock }).save = jest.fn();
      await service.remove(20, 7);
      expect(reconcile.reconcileSafe).toHaveBeenCalledWith([4]);
    });
  });

  describe('audit delle righe', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: 20,
        invoice_id: 'F',
        contratto_id_fk: null,
        deleted: false,
      });
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: null });
    });

    it('righe reinviate identiche: nessuna voce lines in audit', async () => {
      manager.find.mockResolvedValue([
        {
          amount: '100.00',
          utility_id_fk: 3,
          period_start: '2026-01-01',
          period_end: null,
          consumption: '12.500',
          supply_code: null,
          description: null,
        },
      ]);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(
        20,
        {
          lines: [{ amount: 100, utility_id_fk: 3, period_start: '2026-01-01', consumption: 12.5 }],
        } as never,
        7,
      );
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('stesso numero di righe ma importo diverso: voce lines in audit', async () => {
      manager.find.mockResolvedValue([{ amount: '100.00', utility_id_fk: 3 }]);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(20, { lines: [{ amount: 90, utility_id_fk: 3 }] } as never, 7);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: [expect.objectContaining({ fieldName: 'lines', oldValue: 1, newValue: 1 })],
        }),
      );
    });
  });

  describe('getMonthlyCosts (Review Focus 4)', () => {
    it('somma il totale documento (o l’imponibile) del mese corrente, mese 1-based', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '1234.56' }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      expect(await service.getMonthlyCosts()).toBe(1234.56);
      expect(qb.select).toHaveBeenCalledWith(
        'SUM(COALESCE(Invoice.total_amount, Invoice.net_amount_excl_vat))',
        'total',
      );
      expect(qb.andWhere).toHaveBeenCalledWith('MONTH(Invoice.invoice_date) = :month', {
        month: new Date().getMonth() + 1,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        "(Invoice.sdi_status IS NULL OR Invoice.sdi_status <> 'REJECTED')",
      );
    });

    it('restituisce 0 se non ci sono fatture nel mese', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: null }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      expect(await service.getMonthlyCosts()).toBe(0);
    });
  });

  describe('findAll: filtro stato SDI', () => {
    const qbFor = () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('stato indicato', async () => {
      const qb = qbFor();
      await service.findAll({ sdi_status: SdiStatus.REJECTED });
      expect(qb.andWhere).toHaveBeenCalledWith('Invoice.sdi_status = :sdiStatus', {
        sdiStatus: 'REJECTED',
      });
    });

    it('risposta con le quote, il loro impegno e il capitolo; righe senza impegno', async () => {
      const qb = qbFor();
      await service.findAll({});
      const joins = qb.leftJoinAndSelect.mock.calls.map(([path]) => path);
      expect(joins).toEqual(
        expect.arrayContaining([
          'Invoice.commitmentShares',
          'commitmentShares.commitment',
          'shareCommitment.budgetChapter',
        ]),
      );
      expect(joins).not.toContain('lines.commitment');
    });

    it('NONE: fatture senza messaggio SDI', async () => {
      const qb = qbFor();
      await service.findAll({ sdi_status: 'NONE' });
      expect(qb.andWhere).toHaveBeenCalledWith('Invoice.sdi_status IS NULL');
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('sdi_status'),
        expect.objectContaining({ sdi_status: 'NONE' }),
      );
    });
  });
});
