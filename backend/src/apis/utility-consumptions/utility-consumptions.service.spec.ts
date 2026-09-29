import { BadRequestException } from '@nestjs/common';
import { UtilityConsumptionsService } from './utility-consumptions.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

describe('UtilityConsumptionsService', () => {
  let service: UtilityConsumptionsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let utilityRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let meterQb: { where: jest.Mock; andWhere: jest.Mock; getOne: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };

  const lightUtility = { id: 7, utility_id: 'IT001', meter_number: 'M1', utilityType: { hard_type: HardTypeEnum.LIGHT } };
  const existing = [
    { id: 1, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: '1000.000', meter_number: 'M1', deleted: false },
    { id: 2, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-03-01', reading_value: '1300.000', meter_number: 'M1', deleted: false },
  ];

  beforeEach(() => {
    meterQb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    repo = {
      find: jest.fn().mockResolvedValue(existing),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 99, ...data })),
    };
    utilityRepo = {
      findOne: jest.fn().mockResolvedValue(lightUtility),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(meterQb),
    };
    recalc = { recalcUtility: jest.fn().mockResolvedValue(undefined) };
    service = new UtilityConsumptionsService(repo as never, utilityRepo as never, recalc as never);
  });

  const readingDto = (date: string, value: number, meter = 'M1') => ({
    kind: ConsumptionKind.READING,
    reading_date: date,
    reading_value: value,
    meter_number: meter,
    period_start: null,
    period_end: null,
    consumption: null,
  });

  it('crea una lettura valida e ricalcola l’utenza', async () => {
    await service.createForUtility(7, readingDto('2026-04-01', 1400), 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ utility_id_fk: 7, kind: ConsumptionKind.READING, reading_value: 1400, created_by_user_id: 3 }),
    );
    expect(recalc.recalcUtility).toHaveBeenCalledWith(7);
  });

  it('rifiuta una lettura inferiore alla precedente stessa matricola', async () => {
    await expect(service.createForUtility(7, readingDto('2026-02-01', 900), 3)).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta matricola già associata ad altra utenza', async () => {
    meterQb.getOne.mockResolvedValue({ id: 8, utility_id: 'IT002' });
    await expect(service.createForUtility(7, readingDto('2026-04-01', 5, 'OTHER'), 3)).rejects.toThrow(/IT002/);
  });

  it('matricola già dell’utenza (duplicata altrove): nessun check di conflitto', async () => {
    meterQb.getOne.mockResolvedValue({ id: 8, utility_id: 'IT002' });
    await service.createForUtility(7, readingDto('2026-04-01', 1400, ' m1 '), 3);
    expect(repo.save).toHaveBeenCalled();
    expect(utilityRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('eliminare la lettura del nuovo contatore riallinea la matricola dell’utenza', async () => {
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, meter_number: 'M2' });
    repo.findOne.mockResolvedValue({ ...existing[1], id: 99, meter_number: 'M2', reading_date: '2026-04-01' });
    await service.remove(99, 3);
    expect(utilityRepo.update).toHaveBeenCalledWith(7, { meter_number: 'M1' });
    expect(recalc.recalcUtility).toHaveBeenCalledWith(7);
  });

  it('rifiuta utenze INTERNET', async () => {
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, utilityType: { hard_type: HardTypeEnum.INTERNET } });
    await expect(service.createForUtility(7, readingDto('2026-04-01', 1400), 3)).rejects.toThrow(BadRequestException);
  });

  it('lettura più recente con nuova matricola aggiorna la matricola dell’utenza', async () => {
    repo.find
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([
        ...existing,
        { id: 99, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-04-01', reading_value: '5.000', meter_number: 'M2', deleted: false },
      ]);
    await service.createForUtility(7, readingDto('2026-04-01', 5, ' M2 '), 3);
    expect(utilityRepo.update).toHaveBeenCalledWith(7, { meter_number: 'M2' });
  });

  it('matricola uguale a meno di maiuscole/spazi: nessun aggiornamento matricola', async () => {
    repo.find
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([
        ...existing,
        { id: 99, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-04-01', reading_value: '1400.000', meter_number: 'm1', deleted: false },
      ]);
    await service.createForUtility(7, readingDto('2026-04-01', 1400, 'm1'), 3);
    expect(utilityRepo.update).not.toHaveBeenCalled();
  });

  it('PATCH che cambia tipo: campi lettura azzerati, validato come periodo', async () => {
    repo.findOne.mockResolvedValue({ ...existing[1] });
    await service.update(2, { kind: ConsumptionKind.PERIOD, period_start: '2026-05-01', period_end: '2026-05-31', consumption: 40 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: ConsumptionKind.PERIOD, reading_value: null, reading_date: null, meter_number: null, consumption: 40 }),
    );
    expect(recalc.recalcUtility).toHaveBeenCalledWith(7);
  });

  it('PATCH su rilevazione inesistente: 400', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.update(123, { notes: 'x' }, 3)).rejects.toThrow(BadRequestException);
  });

  it('findByUtility: decimal convertiti e consumo calcolato per riga', async () => {
    const rows = await service.findByUtility(7);
    const second = rows.find((r) => r.id === 2);
    expect(second.reading_value).toBe(1300);
    expect(second.computed_consumption).toBe(300);
    expect(rows.find((r) => r.id === 1).computed_consumption).toBeNull();
  });

  it('getSummary: unità, stato stima e serie mensile', async () => {
    utilityRepo.findOne.mockResolvedValue({
      ...lightUtility,
      actual_consumption: '300.00',
      actual_consumption_coverage_days: 59,
      estimated_annual_consumption: '1800.00',
      estimated_consumption_source: EstimateSource.MANUAL,
      estimated_consumption_set_at: new Date('2026-02-10T00:00:00'),
    });
    const summary = await service.getSummary(7);
    expect(summary.unit).toBe('kWh');
    expect(summary.meter_number).toBe('M1');
    expect(summary.actual_consumption).toBe(300);
    expect(summary.estimated_annual_consumption).toBe(1800);
    expect(summary.estimated_valid_until).toBe('2027-02-10');
    expect(summary.monthly).toHaveLength(36);
  });
});
