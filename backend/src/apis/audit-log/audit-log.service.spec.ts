import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditAction } from './entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: { create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };
  let assetRepo: { find: jest.Mock };
  let utilityRepo: { find: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn(),
    };
    assetRepo = { find: jest.fn().mockResolvedValue([]) };
    utilityRepo = { find: jest.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
        { provide: getRepositoryToken(Asset), useValue: assetRepo },
        { provide: getRepositoryToken(Utility), useValue: utilityRepo },
      ],
    }).compile();
    service = moduleRef.get(AuditLogService);
  });

  it('registra un evento CREATE come riga singola senza diff', async () => {
    await service.record({ entityName: 'assets', entityId: 42, action: AuditAction.CREATE, userId: 1 });

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        entity_name: 'assets',
        entity_id: 42,
        action: AuditAction.CREATE,
        field_name: null,
        user_id: 1,
      }),
    ]);
  });

  it('registra un evento UPDATE come una riga per campo cambiato', async () => {
    await service.record({
      entityName: 'assets',
      entityId: 42,
      action: AuditAction.UPDATE,
      userId: 1,
      fields: [
        { fieldName: 'asset_name', oldValue: 'A', newValue: 'B' },
        { fieldName: 'asset_type_id', oldValue: 1, newValue: 2, oldLabel: 'SCUOLE', newLabel: 'UFFICI' },
      ],
    });

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({ field_name: 'asset_name', old_value: 'A', new_value: 'B' }),
      expect.objectContaining({
        field_name: 'asset_type_id',
        old_value: '1',
        new_value: '2',
        old_label: 'SCUOLE',
        new_label: 'UFFICI',
      }),
    ]);
  });

  it('non scrive nulla per un UPDATE senza campi', async () => {
    await service.record({ entityName: 'assets', entityId: 42, action: AuditAction.UPDATE, userId: 1, fields: [] });

    expect(repo.save).not.toHaveBeenCalled();
  });

  describe('query — risoluzione entity_label', () => {
    const buildQb = (items: unknown[]) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([items, items.length]),
    });

    it("risolve entity_label su asset_name per l'entità assets", async () => {
      repo.createQueryBuilder.mockReturnValue(buildQb([{ entity_id: 42 }]));
      assetRepo.find.mockResolvedValue([{ id: 42, asset_name: 'Scuola Primaria' }]);

      const result = await service.query({ entity: 'assets', page: 1, pageSize: 10 } as any);

      expect(assetRepo.find).toHaveBeenCalled();
      expect(result.items[0].entity_label).toBe('Scuola Primaria');
    });

    it("risolve entity_label su utility_id per l'entità utilities", async () => {
      repo.createQueryBuilder.mockReturnValue(buildQb([{ entity_id: 2523 }]));
      utilityRepo.find.mockResolvedValue([{ id: 2523, utility_id: '71011979' }]);

      const result = await service.query({ entity: 'utilities', page: 1, pageSize: 10 } as any);

      expect(result.items[0].entity_label).toBe('71011979');
    });

    it('ritorna entity_label null per entità senza resolver (es. contract)', async () => {
      repo.createQueryBuilder.mockReturnValue(buildQb([{ entity_id: 7 }]));

      const result = await service.query({ entity: 'contract', page: 1, pageSize: 10 } as any);

      expect(result.items[0].entity_label).toBeNull();
      expect(assetRepo.find).not.toHaveBeenCalled();
      expect(utilityRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('purgeOlderThan', () => {
    it('esegue la delete con il cutoff calcolato e ritorna il numero di righe rimosse', async () => {
      const execute = jest.fn().mockResolvedValue({ affected: 5 });
      const qb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute,
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.purgeOlderThan(60);

      expect(qb.where).toHaveBeenCalledWith('field_name IS NOT NULL AND created_at < :cutoff', {
        cutoff: expect.any(Date),
      });
      expect(result).toBe(5);
    });
  });
});
