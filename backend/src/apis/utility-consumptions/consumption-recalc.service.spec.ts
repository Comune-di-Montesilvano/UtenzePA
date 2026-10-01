import { ConsumptionRecalcService } from './consumption-recalc.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

const NOW = new Date('2026-09-29T10:00:00');

describe('ConsumptionRecalcService', () => {
  let service: ConsumptionRecalcService;
  let consumptionRepo: { find: jest.Mock };
  let utilityRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: { innerJoin: jest.Mock; select: jest.Mock; where: jest.Mock; andWhere: jest.Mock; getRawMany: jest.Mock };

  const utility = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    estimated_annual_consumption: '0.00',
    estimated_consumption_source: EstimateSource.NONE,
    estimated_consumption_set_at: null,
    utilityType: { hard_type: HardTypeEnum.LIGHT },
    ...overrides,
  });

  // 2026-07-01..2026-07-10, 100 totali: effettivo 100, copertura 10, stima 3650
  const julyPeriod = [
    { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-07-01', period_end: '2026-07-10', consumption: '100.000' },
  ];

  beforeEach(() => {
    qb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    consumptionRepo = { find: jest.fn().mockResolvedValue(julyPeriod) };
    utilityRepo = {
      findOne: jest.fn().mockResolvedValue(utility()),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    service = new ConsumptionRecalcService(consumptionRepo as never, utilityRepo as never);
  });

  it('NONE con storico: scrive effettivo, copertura e stima HISTORY senza toccare update_date', async () => {
    await service.recalcUtility(7, NOW);
    const [id, patch] = utilityRepo.update.mock.calls[0];
    expect(id).toBe(7);
    expect(patch).toMatchObject({
      actual_consumption: 100,
      actual_consumption_coverage_days: 10,
      estimated_annual_consumption: 3650,
      estimated_consumption_source: EstimateSource.HISTORY,
      estimated_consumption_set_at: null,
    });
    expect(typeof patch.update_date).toBe('function');
    expect(patch.update_date()).toBe('`update_date`');
  });

  it('manuale valida: aggiorna solo effettivo e copertura', async () => {
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2026-03-01') }),
    );
    await service.recalcUtility(7, NOW);
    const patch = utilityRepo.update.mock.calls[0][1];
    expect(patch.actual_consumption).toBe(100);
    expect(patch).not.toHaveProperty('estimated_annual_consumption');
  });

  it('manuale scaduta con storico: passa a HISTORY', async () => {
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2025-01-01') }),
    );
    await service.recalcUtility(7, NOW);
    expect(utilityRepo.update.mock.calls[0][1].estimated_consumption_source).toBe(EstimateSource.HISTORY);
  });

  it('manuale scaduta senza storico: stima invariata', async () => {
    consumptionRepo.find.mockResolvedValue([]);
    utilityRepo.findOne.mockResolvedValue(
      utility({ estimated_consumption_source: EstimateSource.MANUAL, estimated_consumption_set_at: new Date('2025-01-01') }),
    );
    await service.recalcUtility(7, NOW);
    const patch = utilityRepo.update.mock.calls[0][1];
    expect(patch).toMatchObject({ actual_consumption: 0, actual_consumption_coverage_days: 0 });
    expect(patch).not.toHaveProperty('estimated_consumption_source');
  });

  it('utenza INTERNET o inesistente: nessuna scrittura', async () => {
    utilityRepo.findOne.mockResolvedValue(utility({ utilityType: { hard_type: HardTypeEnum.INTERNET } }));
    await service.recalcUtility(7, NOW);
    utilityRepo.findOne.mockResolvedValue(null);
    await service.recalcUtility(8, NOW);
    expect(utilityRepo.update).not.toHaveBeenCalled();
  });

  it('recalcAll: continua dopo un errore su una utenza', async () => {
    qb.getRawMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    utilityRepo.findOne.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(utility({ id: 2 }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(service.recalcAll(NOW)).resolves.toEqual({ processed: 1, failed: 1 });
    expect(utilityRepo.update).toHaveBeenCalledTimes(1);
  });
});
