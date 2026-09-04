import { BadRequestException, HttpException } from '@nestjs/common';
import { UtilitiesService } from './utility.service';
import { Utility } from './entity/utility.entity';
import { ExpiryStatus } from './enum/ExpiryStatus.enum';

function daysFromToday(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function dateStrFromToday(days: number): string {
  return daysFromToday(days).toISOString().slice(0, 10);
}

describe('UtilitiesService', () => {
  let service: UtilitiesService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: {
      query: jest.Mock;
      getRepository: jest.Mock;
    };
  };
  let qb: {
    leftJoin: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    innerJoin: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
  };
  let contractRepo: { find: jest.Mock };

  beforeEach(() => {
    qb = {
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    };
    contractRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
      manager: {
        // nessun contratto corrente per default: niente coppie utility/contratto
        query: jest.fn().mockResolvedValue([]),
        getRepository: jest.fn().mockReturnValue(contractRepo),
      },
    };
    service = new UtilitiesService(repo as never);
  });

  describe('getDaysToExpiry', () => {
    it('restituisce null se non è fornita una data di scadenza', () => {
      expect(service.getDaysToExpiry(null)).toBeNull();
    });

    it('calcola correttamente i giorni mancanti alla scadenza', () => {
      expect(service.getDaysToExpiry(daysFromToday(10))).toBe(10);
    });

    it('calcola un numero negativo per una data già scaduta', () => {
      expect(service.getDaysToExpiry(daysFromToday(-5))).toBe(-5);
    });
  });

  describe('getExpiryStatus', () => {
    it('restituisce null se non è fornita una data di scadenza', () => {
      expect(service.getExpiryStatus(null)).toBeNull();
    });

    it('restituisce EXPIRED se la scadenza è nel passato', () => {
      expect(service.getExpiryStatus(daysFromToday(-1))).toBe(ExpiryStatus.EXPIRED);
    });

    it('restituisce EXPIRING30 al confine inferiore (0 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(0))).toBe(ExpiryStatus.EXPIRING30);
    });

    it('restituisce EXPIRING30 al confine superiore (29 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(29))).toBe(ExpiryStatus.EXPIRING30);
    });

    it('restituisce EXPIRING60 al confine inferiore (30 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(30))).toBe(ExpiryStatus.EXPIRING60);
    });

    it('restituisce EXPIRING60 al confine superiore (59 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(59))).toBe(ExpiryStatus.EXPIRING60);
    });

    it('restituisce EXPIRING90 al confine inferiore (60 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(60))).toBe(ExpiryStatus.EXPIRING90);
    });

    it('restituisce EXPIRING90 al confine superiore (89 giorni)', () => {
      expect(service.getExpiryStatus(daysFromToday(89))).toBe(ExpiryStatus.EXPIRING90);
    });

    it('restituisce ACTIVE oltre i 90 giorni', () => {
      expect(service.getExpiryStatus(daysFromToday(90))).toBe(ExpiryStatus.ACTIVE);
    });
  });

  describe('findAll', () => {
    it('filtra le sole utenze non cancellate di default, fa i join principali e il join (solo filtro) sul contratto corrente', async () => {
      await service.findAll({} as never);

      expect(qb.where).toHaveBeenCalledWith('Utility.deleted = :deleted', { deleted: false });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'Utility.utilityType',
        'utilityType',
        'utilityType.deleted = 0',
      );
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'Utility.asset',
        'asset',
        'asset.deleted = 0',
      );
      // join correlato verso il contratto corrente (solo per WHERE, niente AndSelect:
      // non idratabile da TypeORM insieme agli altri join one-to-many della query)
      expect(qb.leftJoin).toHaveBeenCalledWith(
        expect.any(Function),
        'current_link',
        'current_link.utility_id = Utility.id',
      );
      expect(qb.leftJoin).toHaveBeenCalledWith(
        expect.anything(),
        'currentContract',
        'currentContract.id = current_link.contract_id',
      );
      expect(qb.leftJoin).toHaveBeenCalledWith(
        'currentContract.consipAgreement',
        'currentConsipAgreement',
        'currentConsipAgreement.deleted = 0',
      );
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalledWith(
        expect.anything(),
        'currentContract',
        expect.anything(),
      );
    });

    it('applica il filtro safeguard sul consipAgreement del contratto corrente, convertendolo in 1/0', async () => {
      await service.findAll({ safeguard: true } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentConsipAgreement.safeguard = :safeguard_filter',
        { safeguard_filter: 1 },
      );
    });

    it('applica il filtro su user_id_fk', async () => {
      await service.findAll({ user_id_fk: 3 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('utilizer.id = :user_id_fk', { user_id_fk: 3 });
    });

    it('applica il filtro sullo stato EXPIRED sul contratto corrente', async () => {
      await service.findAll({ utilityState: ExpiryStatus.EXPIRED } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supply_expiry_date < :us_today',
        expect.objectContaining({ us_today: expect.any(Date) }),
      );
    });

    it('applica i filtri ex-diretti su Utility (fornitore, CIG, ordine) sul contratto corrente', async () => {
      await service.findAll({
        supplier_id_fk: 7,
        cig_contract: 'ABC',
        order_number: 'ORD1',
        consip_order: 'CONSIP1',
        consip_agreement_id: 9,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supplier_id_fk = :cf_supplier_id_fk',
        { cf_supplier_id_fk: 7 },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('currentContract.cig_contract LIKE :cf_cig_contract', {
        cf_cig_contract: '%ABC%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.order_number LIKE :cf_order_number',
        { cf_order_number: '%ORD1%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.consip_order LIKE :cf_consip_order',
        { cf_consip_order: '%CONSIP1%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.consip_agreement_id = :cf_consip_agreement_id',
        { cf_consip_agreement_id: 9 },
      );
    });

    it('applica il filtro su supply_expiry_date_range sul contratto corrente, normalizzando le date ISO complete a YYYY-MM-DD', async () => {
      await service.findAll({
        supply_expiry_date_range: ['2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z'],
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supply_expiry_date >= :cf_supply_expiry_date_start',
        { cf_supply_expiry_date_start: '2026-01-01' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supply_expiry_date <= :cf_supply_expiry_date_end',
        { cf_supply_expiry_date_end: '2026-12-31' },
      );
    });

    it('applica il filtro su supply_start_date_range sul contratto corrente, normalizzando le date ISO complete a YYYY-MM-DD', async () => {
      await service.findAll({
        supply_start_date_range: ['2026-02-01T00:00:00.000Z', '2026-11-30T23:59:59.999Z'],
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supply_start_date >= :cf_supply_start_date_start',
        { cf_supply_start_date_start: '2026-02-01' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.supply_start_date <= :cf_supply_start_date_end',
        { cf_supply_start_date_end: '2026-11-30' },
      );
    });

    it('applica il filtro su management_expiry_date_range sul contratto corrente, normalizzando le date ISO complete a YYYY-MM-DD', async () => {
      await service.findAll({
        management_expiry_date_range: ['2026-03-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z'],
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.management_expiry_date >= :cf_management_expiry_date_start',
        { cf_management_expiry_date_start: '2026-03-01' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.management_expiry_date <= :cf_management_expiry_date_end',
        { cf_management_expiry_date_end: '2026-10-31' },
      );
    });

    it('applica il filtro su takeover_termination_date_range sul contratto corrente, normalizzando le date ISO complete a YYYY-MM-DD', async () => {
      await service.findAll({
        takeover_termination_date_range: ['2026-04-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z'],
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.takeover_termination_date >= :cf_takeover_termination_date_start',
        { cf_takeover_termination_date_start: '2026-04-01' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'currentContract.takeover_termination_date <= :cf_takeover_termination_date_end',
        { cf_takeover_termination_date_end: '2026-09-30' },
      );
    });

    it('risolve il contratto corrente in una query batched separata e proietta i campi legacy', async () => {
      const utility = {
        id: 1,
        utilityAggregator: { id: 2 },
        utilityType: null,
      } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);
      repo.manager.query.mockResolvedValue([{ utility_id: 1, contract_id: 50 }]);
      contractRepo.find.mockResolvedValue([
        {
          id: 50,
          supplier: { id: 4, name: 'Fornitore SPA' },
          supplier_id_fk: 4,
          cig_contract: 'CIG1',
          order_number: 'ORD1',
          consip_order: 'CONSIP1',
          consip_agreement_id: 9,
          consipAgreement: { id: 9, safeguard: true },
          supply_start_date: '2026-01-01',
          supply_expiry_date: dateStrFromToday(10),
          management_expiry_date: '2027-01-01',
          takeover_termination_date: '2027-02-01',
          security_deposit: 123.45,
        },
      ]);

      const result = await service.findAll({} as never);

      expect(qb.orderBy).toHaveBeenCalledWith('Utility.id', 'ASC');
      expect(repo.manager.query).toHaveBeenCalledWith(expect.stringContaining('ROW_NUMBER()'), [
        [1],
      ]);
      expect(contractRepo.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        relations: { supplier: true, consipAgreement: true },
      });
      expect(result).toHaveLength(1);
      const enriched = result[0] as unknown as {
        expiryStatus: ExpiryStatus;
        aggregator: unknown;
        supplier: unknown;
        supplier_id_fk: number;
        cig_contract: string;
        security_deposit: number;
      };
      expect(enriched.expiryStatus).toBe(ExpiryStatus.EXPIRING30);
      expect(enriched.aggregator).toEqual({ id: 2 });
      expect(enriched.supplier).toEqual({ id: 4, name: 'Fornitore SPA' });
      expect(enriched.supplier_id_fk).toBe(4);
      expect(enriched.cig_contract).toBe('CIG1');
      expect(enriched.security_deposit).toBe(123.45);
    });

    it('proietta i campi legacy a null/0 quando non esiste un contratto corrente', async () => {
      const utility = { id: 1, utilityType: null } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);
      // repo.manager.query di default risolve [] (nessuna coppia utility/contratto)

      const result = await service.findAll({} as never);

      const enriched = result[0] as unknown as {
        expiryStatus: ExpiryStatus | null;
        supplier: unknown;
        supply_expiry_date: unknown;
        security_deposit: number;
      };
      expect(enriched.expiryStatus).toBeNull();
      expect(enriched.supplier).toBeNull();
      expect(enriched.supply_expiry_date).toBeNull();
      expect(enriched.security_deposit).toBe(0);
    });

    it('non interroga il contratto corrente se non ci sono utenze', async () => {
      qb.getMany.mockResolvedValue([]);

      await service.findAll({} as never);

      expect(repo.manager.query).not.toHaveBeenCalled();
    });

    it('espone le finalità del tipo utenza appiattite in utilityType.purposes', async () => {
      const utility = {
        id: 1,
        utilityType: {
          id: 1,
          utilityTypePurposes: [{ purpose: { id: 5, name: 'Finalità 1' } }],
        },
      } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);

      const result = await service.findAll({} as never);

      expect(result[0].utilityType.purposes).toEqual([{ id: 5, name: 'Finalità 1' }]);
    });
  });

  describe('findBySafeguard', () => {
    it('filtra le utenze con convenzione Consip in safeguard sul contratto corrente tramite inner join', async () => {
      await service.findBySafeguard();

      expect(qb.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        'currentContract',
        'currentContract.id = current_link.contract_id',
      );
      expect(qb.where).toHaveBeenCalledWith('Utility.deleted = :deleted', { deleted: false });
      expect(qb.andWhere).toHaveBeenCalledWith('currentConsipAgreement.safeguard = :safeguard', {
        safeguard: 1,
      });
    });

    it('arricchisce il risultato con expiryStatus dal contratto corrente', async () => {
      const utility = { id: 1, utilityType: null } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);
      repo.manager.query.mockResolvedValue([{ utility_id: 1, contract_id: 50 }]);
      contractRepo.find.mockResolvedValue([
        { id: 50, supply_expiry_date: dateStrFromToday(-1) },
      ]);

      const result = await service.findBySafeguard();

      expect((result[0] as unknown as { expiryStatus: ExpiryStatus }).expiryStatus).toBe(
        ExpiryStatus.EXPIRED,
      );
    });
  });

  describe('findOne', () => {
    it('interroga con query builder, risolve il contratto corrente e proietta i campi legacy', async () => {
      const utility = { id: 1, utilityType: null } as unknown as Utility;
      qb.getOne.mockResolvedValue(utility);
      repo.manager.query.mockResolvedValue([{ utility_id: 1, contract_id: 50 }]);
      contractRepo.find.mockResolvedValue([
        { id: 50, supplier: { id: 4 }, supply_expiry_date: dateStrFromToday(5) },
      ]);

      const result = await service.findOne(1);

      expect(qb.where).toHaveBeenCalledWith('Utility.id = :id', { id: 1 });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'Utility.contratti',
        'contratti',
        'contratti.deleted = 0',
      );
      expect(repo.manager.query).toHaveBeenCalledWith(expect.stringContaining('ROW_NUMBER()'), [
        [1],
      ]);
      expect((result as unknown as { supplier: unknown }).supplier).toEqual({ id: 4 });
      expect((result as unknown as { expiryStatus: ExpiryStatus }).expiryStatus).toBe(
        ExpiryStatus.EXPIRING30,
      );
    });

    it('restituisce null se non trovata (e non interroga il contratto corrente)', async () => {
      qb.getOne.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
      expect(repo.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('crea l\'utenza', async () => {
      const result = await service.create({ supply_expiry_date: null } as never, 4);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ created_by_user_id: 4, updated_by_user_id: 4 }),
      );
      expect(result).toBeDefined();
    });

    it('rilancia un errore gestito se il salvataggio fallisce', async () => {
      repo.save.mockRejectedValue({ code: 'ALTRO' });

      await expect(service.create({} as never)).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('marca l\'utenza come cancellata usando repo.findOne diretto (non il join sul contratto corrente)', async () => {
      const entity = { id: 1, deleted: false } as Utility;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 8);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 8 }),
      );
    });

    it('lancia BadRequestException se l\'utenza non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
