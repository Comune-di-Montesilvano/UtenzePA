import { ConflictException, HttpException, RequestTimeoutException } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BaseService, BaseEntity } from './base.service';

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
