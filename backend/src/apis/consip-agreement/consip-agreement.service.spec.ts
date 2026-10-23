import { BadRequestException } from '@nestjs/common';
import { ConsipAgreementService } from './consip-agreement.service';
import { ConsipAgreement } from './entity/consip-agreement.entity';

describe('ConsipAgreementService', () => {
  let service: ConsipAgreementService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let contractRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let commitments: { listRows: jest.Mock };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    };
    contractRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (d) => d),
    };
    commitments = { listRows: jest.fn().mockResolvedValue([]) };
    service = new ConsipAgreementService(repo as never, contractRepo as never, commitments as never);
  });

  describe('contratti e impegni della convenzione', () => {
    const agreement = { id: 57, supplier_id: 46, deleted: false };

    it('collega un contratto dello stesso fornitore, con audit sul contratto', async () => {
      repo.findOne.mockResolvedValue(agreement);
      contractRepo.findOne.mockResolvedValue({ id: 9, supplier_id_fk: 46, consip_agreement_id: null, deleted: false });
      const record = jest.fn();
      (service as unknown as { auditLogService: unknown }).auditLogService = { record };
      await service.linkContract(57, 9, 3);
      expect(contractRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 9, consip_agreement_id: 57, updated_by_user_id: 3 }),
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityName: 'contract',
          entityId: 9,
          fields: [expect.objectContaining({ fieldName: 'consip_agreement_id', oldValue: null, newValue: 57 })],
        }),
      );
    });

    it('rifiuta un contratto di un altro fornitore', async () => {
      repo.findOne.mockResolvedValue(agreement);
      contractRepo.findOne.mockResolvedValue({ id: 9, supplier_id_fk: 12, consip_agreement_id: null, deleted: false });
      await expect(service.linkContract(57, 9, 3)).rejects.toThrow(BadRequestException);
      expect(contractRepo.save).not.toHaveBeenCalled();
    });

    it('scollega solo un contratto di questa convenzione', async () => {
      repo.findOne.mockResolvedValue(agreement);
      contractRepo.findOne.mockResolvedValue({ id: 9, supplier_id_fk: 46, consip_agreement_id: 58, deleted: false });
      await expect(service.unlinkContract(57, 9, 3)).rejects.toThrow(BadRequestException);
      contractRepo.findOne.mockResolvedValue({ id: 9, supplier_id_fk: 46, consip_agreement_id: 57, deleted: false });
      await service.unlinkContract(57, 9, 3);
      expect(contractRepo.save).toHaveBeenCalledWith(expect.objectContaining({ consip_agreement_id: null }));
    });

    it('impegni: quelli dei contratti della convenzione, totali sui soli importi noti', async () => {
      commitments.listRows.mockResolvedValue([
        { id: 1, amount: 100, spent: 30, remaining: 70 },
        { id: 2, amount: null, spent: 5, remaining: null },
      ]);
      const result = await service.commitments(57);
      expect(commitments.listRows).toHaveBeenCalledWith({ consip_agreement_id: 57 });
      expect(result.items.map((r) => r.id)).toEqual([1, 2]);
      expect(result.totals).toEqual({ amount: 100, spent: 35, remaining: 70 });
    });

    it('scheda: contratti collegati non cancellati', async () => {
      repo.findOne.mockResolvedValue(agreement);
      contractRepo.find.mockResolvedValue([{ id: 9, cig_contract: 'A', consip_order: '1', supply_start_date: null, supply_expiry_date: null, closed: false }]);
      const result = await service.findOneWithContracts(57);
      expect(result.contracts.map((c) => c.id)).toEqual([9]);
      expect(contractRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { consip_agreement_id: 57, deleted: false } }),
      );
    });
  });

  describe('findAll', () => {
    it('con deleted=true elenca gli eliminati, senza ripetere deleted tra i filtri generici', async () => {
      await service.findAll({ deleted: true } as never);
      expect(qb.where).toHaveBeenCalledWith('consip_agreement.deleted = :deleted', { deleted: true });
      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('.deleted'), expect.anything());
    });

    it('filtra le sole convenzioni non cancellate e fa il join col fornitore', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('consip_agreement.deleted = :deleted', {
        deleted: false,
      });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('consip_agreement.supplier', 'supplier');
    });

    it('applica il filtro LIKE per name/description/cig_master', async () => {
      await service.findAll({ cig_master: 'CIG1' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('consip_agreement.cig_master LIKE :cig_master', {
        cig_master: '%CIG1%',
      });
    });

    it('applica il range sulla data di scadenza', async () => {
      await service.findAll({
        expiration_date_range: ['2026-01-01', '2026-12-31'],
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('consip_agreement.expiration_date >= :expiration_date_start', {
        expiration_date_start: '2026-01-01',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('consip_agreement.expiration_date <= :expiration_date_end', {
        expiration_date_end: '2026-12-31',
      });
    });

    it('applica il filtro esatto per gli altri campi', async () => {
      await service.findAll({ supplier_id: 7 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('consip_agreement.supplier_id = :supplier_id', {
        supplier_id: 7,
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const items = [{ id: 1 } as ConsipAgreement];
      qb.getMany.mockResolvedValue(items);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('consip_agreement.id', 'ASC');
      expect(result).toBe(items);
    });
  });

  describe('create (ereditato da BaseService)', () => {
    it('crea la convenzione', async () => {
      const result = await service.create({ name: 'Convenzione 1' } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Convenzione 1' }));
      expect(result).toEqual(expect.objectContaining({ name: 'Convenzione 1' }));
    });
  });

  describe('update (ereditato da BaseService)', () => {
    it('aggiorna la convenzione esistente', async () => {
      const entity = { id: 1, name: 'Convenzione 1' } as ConsipAgreement;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { name: 'Convenzione 2' } as never, 3);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Convenzione 2', updated_by_user_id: 3 }),
      );
    });

    it('lancia BadRequestException se la convenzione non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove (ereditato da BaseService)', () => {
    it('marca la convenzione come cancellata', async () => {
      const entity = { id: 1, deleted: false } as ConsipAgreement;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 4);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 4 }),
      );
    });
  });
});
