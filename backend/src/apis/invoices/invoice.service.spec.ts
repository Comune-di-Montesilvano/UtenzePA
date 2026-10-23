import { SdiStatus } from './enum/sdi-status.enum';
import { InvoicesService } from './invoice.service';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { SdiMessage } from '@apis/invoice-import/entity/sdi-message.entity';

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
      manager.find.mockResolvedValue([{ id: 5, contracts: [{ id: 1 }] }]);
      await service.create(
        {
          invoice_id: 'F-1',
          invoice_date: '2025-03-15',
          contratto_id_fk: 1,
          lines: [{ amount: 10, commitment_id_fk: 5 }, { amount: 2 }],
        } as never,
        3,
      );
      expect(manager.save).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({ supplier_id_fk: 44 }),
      );
      expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [
        expect.objectContaining({ invoice_id_fk: 10, amount: 10, commitment_id_fk: 5, commitment_auto: false }),
        expect.objectContaining({ amount: 2, commitment_id_fk: null, commitment_auto: true }),
      ]);
      expect(reconcile.reconcileSafe).toHaveBeenCalledWith([1]);
    });

    it('riga automatica: l’impegno lo sceglie il ricalcolo, nessun controllo', async () => {
      manager.find.mockResolvedValue([]);
      await service.create(
        {
          invoice_id: 'F-1',
          invoice_date: '2025-03-15',
          contratto_id_fk: 1,
          lines: [{ amount: 10, commitment_id_fk: 99, commitment_auto: true }],
        } as never,
        3,
      );
      expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [
        expect.objectContaining({ commitment_id_fk: null, commitment_auto: true }),
      ]);
    });

    it('riga manuale su impegno condiviso: basta che includa il contratto della fattura', async () => {
      manager.find.mockResolvedValue([{ id: 5, contracts: [{ id: 3 }, { id: 1 }] }]);
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2025-03-15',
            contratto_id_fk: 1,
            lines: [{ amount: 10, commitment_id_fk: 5 }],
          } as never,
          3,
        ),
      ).resolves.toBeDefined();
    });

    it('rifiuta un impegno di un altro contratto, indicando la riga (Review Focus 3)', async () => {
      manager.find.mockResolvedValue([{ id: 5, contracts: [{ id: 2 }, { id: 3 }] }]);
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2025-03-15',
            contratto_id_fk: 1,
            lines: [{ amount: 1 }, { amount: 10, commitment_id_fk: 5 }],
          } as never,
          3,
        ),
      ).rejects.toThrow("L'impegno della riga 2 non è del contratto della fattura");
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('rifiuta un impegno inesistente o cancellato', async () => {
      manager.find.mockResolvedValue([]);
      await expect(
        service.create(
          {
            invoice_id: 'F-1',
            invoice_date: '2025-03-15',
            contratto_id_fk: 1,
            lines: [{ amount: 10, commitment_id_fk: 99 }],
          } as never,
          3,
        ),
      ).rejects.toThrow("L'impegno della riga 1 non esiste");
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
          { invoice_id: 'NC-1', invoice_date: '2026-06-29', total_amount: -23.52, net_amount_excl_vat: -19.28 } as never,
          3,
        ),
      ).resolves.toBeDefined();
      for (const total_amount of [10, null]) {
        await expect(
          service.create(
            { invoice_id: 'F-2', invoice_date: '2026-06-29', total_amount, net_amount_excl_vat: -5 } as never,
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
        expect.objectContaining({ entityName: 'Invoice', entityId: 10, action: 'CREATE', userId: 5 }),
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
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'NC', total_amount: '-90.79', deleted: false });
      await expect(service.update(20, { net_amount_excl_vat: -74.42 } as never, 7)).resolves.toBeDefined();
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', total_amount: '90.79', deleted: false });
      await expect(service.update(20, { net_amount_excl_vat: -74.42 } as never, 7)).rejects.toThrow('nota di credito');
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
      expect(manager.save).toHaveBeenCalledWith(Invoice, expect.objectContaining({ import_locked: true }));
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

  describe('impegni e contratto (review)', () => {
    it('riga con impegno su fattura senza contratto: 400', async () => {
      manager.find.mockResolvedValue([{ id: 5, contracts: [{ id: 1 }] }]);
      await expect(
        service.create(
          { invoice_id: 'F-1', invoice_date: '2025-03-15', lines: [{ amount: 1, commitment_id_fk: 5 }] } as never,
          3,
        ),
      ).rejects.toThrow("La riga 1 ha un impegno ma la fattura non ha un contratto");
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('cambio contratto senza lines: ricontrolla gli impegni delle righe esistenti', async () => {
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 1, deleted: false });
      manager.find.mockImplementation(async (entity: unknown) =>
        entity === InvoiceLine
          ? [{ amount: '10.00', commitment_id_fk: 5 }]
          : [{ id: 5, contracts: [{ id: 1 }] }],
      );
      await expect(service.update(20, { contratto_id_fk: 2 } as never, 7)).rejects.toThrow(
        "L'impegno della riga 1 non è del contratto della fattura",
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('update con riga manuale su impegno non legato al contratto: 400', async () => {
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 1, deleted: false });
      manager.find.mockImplementation(async (entity: unknown) =>
        entity === InvoiceLine ? [] : [{ id: 5, contracts: [{ id: 2 }] }],
      );
      await expect(
        service.update(20, { lines: [{ amount: 10, commitment_id_fk: 5, commitment_auto: false }] } as never, 7),
      ).rejects.toThrow("L'impegno della riga 1 non è del contratto della fattura");
    });

    it('cambio contratto: le righe automatiche non bloccano, ricalcolo su vecchio e nuovo', async () => {
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 1, deleted: false });
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: 2 });
      manager.find.mockImplementation(async (entity: unknown) =>
        entity === InvoiceLine
          ? [{ amount: '10.00', commitment_id_fk: 5, commitment_auto: true }]
          : [{ id: 5, contracts: [{ id: 1 }] }],
      );
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
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: null, deleted: false });
      manager.findOne.mockResolvedValue({ id: 20, invoice_id: 'F', contratto_id_fk: null });
    });

    it('righe reinviate identiche: nessuna voce lines in audit', async () => {
      manager.find.mockResolvedValue([
        { amount: '100.00', utility_id_fk: 3, commitment_id_fk: null, period_start: '2026-01-01', period_end: null, consumption: '12.500', supply_code: null, description: null },
      ]);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(
        20,
        { lines: [{ amount: 100, utility_id_fk: 3, period_start: '2026-01-01', consumption: 12.5 }] } as never,
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
