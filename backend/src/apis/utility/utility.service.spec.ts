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

describe('UtilitiesService', () => {
  let service: UtilitiesService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    innerJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
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
    it('filtra le sole utenze non cancellate di default e fa i join principali', async () => {
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
    });

    it('applica il filtro safeguard convertendolo in 1/0', async () => {
      await service.findAll({ safeguard: true } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('consipAgreement.safeguard = :safeguard_filter', {
        safeguard_filter: 1,
      });
    });

    it('applica il filtro su user_id_fk', async () => {
      await service.findAll({ user_id_fk: 3 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('utilizer.id = :user_id_fk', { user_id_fk: 3 });
    });

    it('applica il filtro sullo stato EXPIRED', async () => {
      await service.findAll({ utilityState: ExpiryStatus.EXPIRED } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'Utility.supply_expiry_date < :us_today',
        expect.objectContaining({ us_today: expect.any(Date) }),
      );
    });

    it('ordina per id ascendente e arricchisce il risultato con expiryStatus e aggregator', async () => {
      const utility = {
        id: 1,
        supply_expiry_date: daysFromToday(10),
        utilityAggregator: { id: 2 },
        utilityType: null,
      } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);

      const result = await service.findAll({} as never);

      expect(qb.orderBy).toHaveBeenCalledWith('Utility.id', 'ASC');
      expect(result).toHaveLength(1);
      const enriched = result[0] as unknown as { expiryStatus: ExpiryStatus; aggregator: unknown };
      expect(enriched.expiryStatus).toBe(ExpiryStatus.EXPIRING30);
      expect(enriched.aggregator).toEqual({ id: 2 });
    });

    it('espone le finalità del tipo utenza appiattite in utilityType.purposes', async () => {
      const utility = {
        id: 1,
        supply_expiry_date: null,
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
    it('filtra le utenze con convenzione Consip in safeguard tramite inner join', async () => {
      await service.findBySafeguard();

      expect(qb.innerJoinAndSelect).toHaveBeenCalledWith(
        'Utility.consipAgreement',
        'consipAgreement',
        'consipAgreement.deleted = 0',
      );
      expect(qb.where).toHaveBeenCalledWith('Utility.deleted = :deleted', { deleted: false });
      expect(qb.andWhere).toHaveBeenCalledWith('consipAgreement.safeguard = :safeguard', {
        safeguard: 1,
      });
    });

    it('arricchisce il risultato con expiryStatus', async () => {
      const utility = {
        id: 1,
        supply_expiry_date: daysFromToday(-1),
        utilityType: null,
      } as unknown as Utility;
      qb.getMany.mockResolvedValue([utility]);

      const result = await service.findBySafeguard();

      expect((result[0] as unknown as { expiryStatus: ExpiryStatus }).expiryStatus).toBe(
        ExpiryStatus.EXPIRED,
      );
    });
  });

  describe('findOne', () => {
    it('restituisce l\'utenza con tutte le relazioni', async () => {
      const utility = { id: 1 } as Utility;
      repo.findOne.mockResolvedValue(utility);

      const result = await service.findOne(1);

      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          relations: expect.objectContaining({ asset: true, utilityType: true }),
        }),
      );
      expect(result).toBe(utility);
    });

    it('restituisce null se non trovata', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
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
    it('marca l\'utenza come cancellata', async () => {
      const entity = { id: 1, deleted: false } as Utility;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 8);

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
