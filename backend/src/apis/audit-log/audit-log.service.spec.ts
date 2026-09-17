import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditAction } from './entity/audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: { create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditLogService, { provide: getRepositoryToken(AuditLog), useValue: repo }],
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
