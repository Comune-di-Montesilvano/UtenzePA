import { ConflictException, HttpException, RequestTimeoutException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BaseService, BaseEntity, toFindOptionsRelations } from './base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';

interface TestEntity extends BaseEntity {
  name?: string;
  active?: boolean;
  createdAt?: Date;
}

class TestService extends BaseService<TestEntity, Partial<TestEntity>, Partial<TestEntity>> {
  protected readonly entityName = 'test';
  protected readonly relations: string[] = [];

  constructor(protected readonly repo: Repository<TestEntity>) {
    super();
  }

  applyFiltersPublic(qb: SelectQueryBuilder<TestEntity>, filters: Record<string, any>, exclude: string[] = []) {
    return this.applyFilters(qb, filters, 'test', exclude);
  }

  manageErrorsPublic(error: any, message: string): never {
    return this.manageErrors(error, message);
  }
}

describe('BaseService', () => {
  let service: TestService;
  let qb: Partial<Record<keyof SelectQueryBuilder<TestEntity>, jest.Mock>>;

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getCount: jest.fn(),
    };
    const repo = {} as Repository<TestEntity>;
    service = new TestService(repo);
  });

  describe('applyFilters', () => {
    it('ignora le chiavi escluse', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, { deleted: true }, ['deleted']);

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('ignora valori undefined/null', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, {
        name: undefined,
        active: null,
      });

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('applica LIKE per le stringhe non vuote, trimmate', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, { name: '  mario  ' });

      expect(qb.andWhere).toHaveBeenCalledWith('test.name LIKE :filter_name', {
        filter_name: '%mario%',
      });
    });

    it('ignora le stringhe vuote/whitespace', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, { name: '   ' });

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('converte i booleani in 1/0', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, { active: true });

      expect(qb.andWhere).toHaveBeenCalledWith('test.active = :filter_active', { filter_active: 1 });
    });

    it('applica un filtro esatto per i numeri', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, { id: 42 });

      expect(qb.andWhere).toHaveBeenCalledWith('test.id = :filter_id', { filter_id: 42 });
    });

    it('gestisce i range con solo il limite inferiore', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, {
        createdAt_range: ['2026-01-01', null],
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'test.createdAt >= :createdAt_range_start',
        expect.objectContaining({ createdAt_range_start: expect.any(String) }),
      );
    });

    it('gestisce i range con entrambi i limiti', () => {
      service.applyFiltersPublic(qb as unknown as SelectQueryBuilder<TestEntity>, {
        createdAt_range: ['2026-01-01', '2026-01-31'],
      });

      expect(qb.andWhere).toHaveBeenCalledTimes(2);
    });
  });

  describe('manageErrors', () => {
    it('mappa ER_DUP_ENTRY in ConflictException', () => {
      expect(() => service.manageErrorsPublic({ code: 'ER_DUP_ENTRY' }, 'errore')).toThrow(
        ConflictException,
      );
    });

    it('mappa errno 1062 in ConflictException', () => {
      expect(() => service.manageErrorsPublic({ errno: 1062 }, 'errore')).toThrow(ConflictException);
    });

    it('mappa ER_DUP_ENTRY dentro driverError in ConflictException', () => {
      expect(() =>
        service.manageErrorsPublic({ driverError: { code: 'ER_DUP_ENTRY' } }, 'errore'),
      ).toThrow(ConflictException);
    });

    it('mappa ECONNREFUSED in RequestTimeoutException', () => {
      expect(() => service.manageErrorsPublic({ code: 'ECONNREFUSED' }, 'errore')).toThrow(
        RequestTimeoutException,
      );
    });

    it('mappa un errore generico in HttpException 400 con il messaggio dato', () => {
      try {
        service.manageErrorsPublic({ code: 'ALTRO' }, 'messaggio custom');
        fail('doveva lanciare');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).message).toBe('messaggio custom');
        expect((error as HttpException).getStatus()).toBe(400);
      }
    });
  });
});

describe('BaseService — audit', () => {
  let service: TestService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => x),
    };
    auditLogService = { record: jest.fn() };
    service = new TestService(repo as unknown as Repository<TestEntity>);
    (service as any).auditLogService = auditLogService;
  });

  it('registra un CREATE con lo userId passato', async () => {
    repo.save.mockResolvedValueOnce({ id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 });

    await service.create({ name: 'Mario' } as any, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'test', entityId: 1, action: AuditAction.CREATE, userId: 9 }),
    );
  });

  it('registra un diff per ogni campo cambiato in update, escludendo i campi in blocklist', async () => {
    const existing = { id: 1, name: 'Mario', active: true, deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...existing, name: 'Luigi' } as any);

    await service.update(1, { name: 'Luigi', updated_by_user_id: 9 } as any, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        userId: 9,
        fields: [expect.objectContaining({ fieldName: 'name', oldValue: 'Mario', newValue: 'Luigi' })],
      }),
    );
  });

  it('non registra nulla se nessun campo tracciabile è cambiato', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await service.update(1, { name: 'Mario' } as any, 9);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('registra un DELETE', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await service.remove(1, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.DELETE, entityId: 1, userId: 9 }),
    );
  });

  it('non lancia se auditLogService non è impostato (property injection assente, es. test esistenti)', async () => {
    (service as any).auditLogService = undefined;
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await expect(service.remove(1, 9)).resolves.toBeUndefined();
  });

  it('non registra un diff spurio su un campo Date invariato rimandato come stringa ISO dal client (round-trip PATCH)', async () => {
    const sameDate = new Date('2026-01-01T00:00:00.000Z');
    // `existing` simula l'entity idratata da mysql2 (repo.findOne): la colonna
    // date/timestamp arriva come istanza Date reale, non come stringa.
    const existing = { id: 1, name: 'Mario', createdAt: sameDate, deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...existing } as any);

    // Il client rimanda l'intero record, incluso il campo data invariato ma
    // serializzato come stringa ISO (pattern comune in questa codebase).
    await service.update(1, { name: 'Mario', createdAt: sameDate.toISOString() } as any, 9);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('non registra un diff spurio quando NULL diventa stringa vuota (input di testo non compilato)', async () => {
    const existing = { id: 1, name: 'Mario', active: null, deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...existing } as any);

    // Un input Angular non compilato manda '', non null — stesso "vuoto" del
    // valore mai impostato in DB, non un cambio reale.
    await service.update(1, { name: 'Mario', active: '' } as any, 9);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('non registra un diff spurio su un campo decimal invariato (stringa "0.00" da mysql2 vs number 0 dal form)', async () => {
    const existing = { id: 1, name: 'Mario', active: '0.00', deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...existing } as any);

    await service.update(1, { name: 'Mario', active: 0 } as any, 9);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('create completa con successo anche se auditLogService.record rigetta (audit best-effort)', async () => {
    const saved = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    repo.save.mockResolvedValueOnce(saved);
    auditLogService.record.mockRejectedValueOnce(new Error('audit write failed'));

    await expect(service.create({ name: 'Mario' } as any, 9)).resolves.toEqual(saved);
  });

  it('update completa con successo anche se auditLogService.record rigetta (audit best-effort)', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    const updated = { ...existing, name: 'Luigi' };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue(updated as any);
    auditLogService.record.mockRejectedValueOnce(new Error('audit write failed'));

    await expect(
      service.update(1, { name: 'Luigi', updated_by_user_id: 9 } as any, 9),
    ).resolves.toEqual(updated);
  });

  it('remove completa con successo anche se auditLogService.record rigetta (audit best-effort)', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);
    auditLogService.record.mockRejectedValueOnce(new Error('audit write failed'));

    await expect(service.remove(1, 9)).resolves.toBeUndefined();
  });
});

describe('toFindOptionsRelations', () => {
  it('converte un array di relation name nella forma oggetto attesa da TypeORM 1.0', () => {
    expect(toFindOptionsRelations(['asset', 'utilityType'])).toEqual({
      asset: true,
      utilityType: true,
    });
  });

  it('converte un array vuoto in un oggetto vuoto', () => {
    expect(toFindOptionsRelations([])).toEqual({});
  });
});
