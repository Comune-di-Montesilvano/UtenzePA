import { SdiStatus } from './enum/sdi-status.enum';
import { InvoicesService } from './invoice.service';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let contractRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
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
    service = new InvoicesService(repo as never, contractRepo as never, dataSource as never);
  });

  describe('create', () => {
    it('salva testata e righe in transazione, fornitore preso dal contratto', async () => {
      manager.find.mockResolvedValue([{ id: 5, contract_id_fk: 1 }]);
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
        expect.objectContaining({ invoice_id_fk: 10, amount: 10, commitment_id_fk: 5 }),
        expect.objectContaining({ amount: 2 }),
      ]);
    });

    it('rifiuta un impegno di un altro contratto, indicando la riga (Review Focus 3)', async () => {
      manager.find.mockResolvedValue([{ id: 5, contract_id_fk: 2 }]);
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

    it('lines vuoto cancella tutte le righe', async () => {
      await service.update(20, { lines: [] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 20 });
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
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

  describe('impegni e contratto (review)', () => {
    it('riga con impegno su fattura senza contratto: 400', async () => {
      manager.find.mockResolvedValue([{ id: 5, contract_id_fk: 1 }]);
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
          : [{ id: 5, contract_id_fk: 1 }],
      );
      await expect(service.update(20, { contratto_id_fk: 2 } as never, 7)).rejects.toThrow(
        "L'impegno della riga 1 non è del contratto della fattura",
      );
      expect(manager.save).not.toHaveBeenCalled();
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
