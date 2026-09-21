import { ForbiddenException } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: { query: jest.Mock };

  beforeEach(() => {
    service = { query: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }) };
    controller = new AuditLogController(service as unknown as AuditLogService);
  });

  it('consente a un Operatore di leggere lo storico di un singolo record (entityId presente)', async () => {
    await controller.find({ entity: 'assets', entityId: 42 } as any, { id: 5, role: 'Operatore' } as any);
    expect(service.query).toHaveBeenCalled();
  });

  it('blocca un Operatore che prova a leggere il log globale (entityId assente)', async () => {
    await expect(
      controller.find({ entity: 'assets' } as any, { id: 5, role: 'Operatore' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('consente a un Admin di leggere il log globale', async () => {
    await controller.find({ entity: 'assets' } as any, { id: 5, role: 'Admin' } as any);
    expect(service.query).toHaveBeenCalled();
  });
});
