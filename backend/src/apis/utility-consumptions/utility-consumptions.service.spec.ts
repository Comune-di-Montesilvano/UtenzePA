import { BadRequestException } from '@nestjs/common';
import { UtilityConsumptionsService } from './utility-consumptions.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';

describe('UtilityConsumptionsService', () => {
  let service: UtilityConsumptionsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let utilityRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let meterQb: { where: jest.Mock; andWhere: jest.Mock; getMany: jest.Mock };
  let audit: { record: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };
  let eventRepo: { find: jest.Mock };

  const lightUtility = { id: 7, utility_id: 'IT001', meter_number: 'M1', utilityType: { hard_type: HardTypeEnum.LIGHT } };
  const existing = [
    { id: 1, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-01-01', reading_value: '1000.000', meter_number: 'M1', deleted: false },
    { id: 2, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-03-01', reading_value: '1300.000', meter_number: 'M1', deleted: false },
  ];

  beforeEach(() => {
    meterQb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
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
    eventRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new UtilityConsumptionsService(
      repo as never,
      utilityRepo as never,
      recalc as never,
      eventRepo as never,
    );
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    (service as unknown as { auditLogService: unknown }).auditLogService = audit;
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
    meterQb.getMany.mockResolvedValue([{ id: 8, utility_id: 'IT002', meter_number: 'OTHER' }]);
    await expect(service.createForUtility(7, readingDto('2026-04-01', 5, 'OTHER'), 3)).rejects.toThrow(/IT002/);
  });

  it('matricola già dell’utenza (duplicata altrove): nessun check di conflitto', async () => {
    meterQb.getMany.mockResolvedValue([{ id: 8, utility_id: 'IT002', meter_number: 'M1' }]);
    await service.createForUtility(7, readingDto('2026-04-01', 1400, ' m1 '), 3);
    expect(repo.save).toHaveBeenCalled();
    expect(utilityRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('eliminare la lettura del nuovo contatore riallinea la matricola dell’utenza', async () => {
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, meter_number: 'M2' });
    repo.findOne.mockResolvedValue({ ...existing[1], id: 99, meter_number: 'M2', reading_date: '2026-04-01' });
    await service.remove(99, 3);
    expect(utilityRepo.update).toHaveBeenCalledWith(7, { meter_number: 'M1', updated_by_user_id: 3 });
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
    expect(utilityRepo.update).toHaveBeenCalledWith(7, { meter_number: 'M2', updated_by_user_id: 3 });
    expect(audit.record).toHaveBeenCalledWith({
      entityName: 'utilities',
      entityId: 7,
      action: 'UPDATE',
      userId: 3,
      fields: [{ fieldName: 'meter_number', oldValue: 'M1', newValue: 'M2', oldLabel: null, newLabel: null }],
    });
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

  const periodDto = (extra: Record<string, unknown> = {}) => ({
    kind: ConsumptionKind.PERIOD, reading_date: null, reading_value: null, meter_number: null,
    period_start: '2026-05-01', period_end: '2026-05-31', consumption: 100, ...extra,
  });

  it('periodo elettrico con fasce coerenti e penale: salvati', async () => {
    repo.find.mockResolvedValue([]);
    await service.createForUtility(7, periodDto({ consumption_f1: 60, consumption_f2: 40, reactive_penalty: true }) as never, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ consumption_f1: 60, consumption_f2: 40, reactive_penalty: true }));
  });

  it('fasce che non sommano al consumo: 400 e nessun salvataggio', async () => {
    repo.find.mockResolvedValue([]);
    await expect(service.createForUtility(7, periodDto({ consumption_f1: 10 }) as never, 3)).rejects.toThrow(
      'La somma delle fasce (10 kWh) non coincide con il consumo del periodo (100 kWh).',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('utenza gas: fasce e penale azzerate senza errore', async () => {
    repo.find.mockResolvedValue([]);
    utilityRepo.findOne.mockResolvedValue({ ...lightUtility, utilityType: { hard_type: HardTypeEnum.GAS } });
    await service.createForUtility(7, periodDto({ consumption_f1: 10, reactive_penalty: true }) as never, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ consumption_f1: null, reactive_penalty: null }));
  });

  it('PATCH del solo consumo: la somma è ricontrollata con le fasce già salvate', async () => {
    const current = { id: 5, utility_id_fk: 7, ...periodDto({ consumption_f1: '60.000', consumption_f2: '40.000' }), deleted: false };
    repo.findOne.mockResolvedValue(current);
    repo.find.mockResolvedValue([current]);
    await expect(service.update(5, { consumption: 150 } as never, 3)).rejects.toThrow('non coincide con il consumo del periodo');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('lettura elettrica con totalizzatori di fascia: salvati; incoerenti col valore letto: 400', async () => {
    await service.createForUtility(7, { ...readingDto('2026-04-01', 1400), consumption_f1: 800, consumption_f2: 400, consumption_f3: 200 } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ consumption_f1: 800, consumption_f3: 200, consumption_f0: null }));
    await expect(
      service.createForUtility(7, { ...readingDto('2026-05-01', 1500), consumption_f1: 800 } as never, 3),
    ).rejects.toThrow('La somma dei totalizzatori di fascia (800 kWh) non coincide con il valore letto (1500 kWh).');
  });

  it('getSummary: serie mensile con le fasce quando ci sono dati di fascia', async () => {
    repo.find.mockResolvedValue([
      { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-05-01', period_end: '2026-05-31', consumption: '100.000', consumption_f1: '70.000', consumption_f2: '30.000', deleted: false },
    ]);
    const s = await service.getSummary(7);
    expect(s.monthly.find((p) => p.month === '2026-05')?.bands).toEqual({ F1: 70, F2: 30 });
  });

  it('getSummary: i giorni in cui l’utenza era cessata non sono buchi', async () => {
    repo.find.mockResolvedValue([
      { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: '31.000', deleted: false },
      { id: 2, kind: ConsumptionKind.PERIOD, period_start: '2026-04-01', period_end: '2026-04-30', consumption: '30.000', deleted: false },
    ]);
    const base = { third_party_id_fk: null, requested_on: null, date_unknown: false, cancelled_on: null, deleted: false, utilizer_grant_id_fk: null, create_date: new Date('2025-01-01T10:00:00Z') };
    eventRepo.find.mockResolvedValue([
      { ...base, id: 1, type: 'ACTIVATION', effective_on: null, date_unknown: true },
      { ...base, id: 2, type: 'CESSATION', effective_on: '2026-01-31' },
      { ...base, id: 3, type: 'ACTIVATION', effective_on: '2026-04-01' },
    ]);
    const s = await service.getSummary(7);
    expect(s.gaps).toEqual([]);
    expect(eventRepo.find).toHaveBeenCalledWith({ where: { utility_id_fk: 7, deleted: false } });
  });

  it('getSummary: i mesi di voltura a un terzo non sono buchi (bollette al terzo)', async () => {
    repo.find.mockResolvedValue([
      { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: '31.000', deleted: false },
      { id: 2, kind: ConsumptionKind.PERIOD, period_start: '2026-04-01', period_end: '2026-04-30', consumption: '30.000', deleted: false },
    ]);
    const base = { third_party_id_fk: null, requested_on: null, date_unknown: false, cancelled_on: null, deleted: false, utilizer_grant_id_fk: null, create_date: new Date('2025-01-01T10:00:00Z') };
    eventRepo.find.mockResolvedValue([
      { ...base, id: 1, type: 'ACTIVATION', effective_on: null, date_unknown: true },
      { ...base, id: 2, type: 'TRANSFER', third_party_id_fk: 5, effective_on: '2026-01-31' },
      { ...base, id: 3, type: 'RETURN', effective_on: '2026-04-01' },
    ]);
    expect((await service.getSummary(7)).gaps).toEqual([]);
  });

  it('getSummary: volturata per tutto il periodo: nessun buco', async () => {
    repo.find.mockResolvedValue([
      { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: '31.000', deleted: false },
      { id: 2, kind: ConsumptionKind.PERIOD, period_start: '2026-04-01', period_end: '2026-04-30', consumption: '30.000', deleted: false },
    ]);
    const base = { third_party_id_fk: null, requested_on: null, date_unknown: false, cancelled_on: null, deleted: false, utilizer_grant_id_fk: null, create_date: new Date('2025-01-01T10:00:00Z') };
    eventRepo.find.mockResolvedValue([
      { ...base, id: 1, type: 'ACTIVATION', effective_on: null, date_unknown: true },
      { ...base, id: 2, type: 'TRANSFER', third_party_id_fk: 5, effective_on: null, date_unknown: true },
    ]);
    expect((await service.getSummary(7)).gaps).toEqual([]);
  });

  it('getSummary: senza storico i buchi restano', async () => {
    repo.find.mockResolvedValue([
      { id: 1, kind: ConsumptionKind.PERIOD, period_start: '2026-01-01', period_end: '2026-01-31', consumption: '31.000', deleted: false },
      { id: 2, kind: ConsumptionKind.PERIOD, period_start: '2026-04-01', period_end: '2026-04-30', consumption: '30.000', deleted: false },
    ]);
    const s = await service.getSummary(7);
    expect(s.gaps).toEqual([{ start: '2026-02-01', end: '2026-03-31' }]);
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

  it('findByUtility: stima superata tra due reali marcata, senza consumo calcolato', async () => {
    repo.find.mockResolvedValue([
      ...existing,
      { id: 3, utility_id_fk: 7, kind: ConsumptionKind.READING, reading_date: '2026-02-01', reading_value: '2000.000', meter_number: 'M1', is_estimated: true, deleted: false },
    ]);
    const rows = await service.findByUtility(7);
    const est = rows.find((r) => r.id === 3);
    expect(est.superseded).toBe(true);
    expect(est.is_estimated).toBe(true);
    expect(est.computed_consumption).toBeNull();
    expect(rows.find((r) => r.id === 2)).toMatchObject({ superseded: false, computed_consumption: 300 });
  });

  it('PATCH delle sole note su una stimata: validata come stimata', async () => {
    const current = { id: 3, utility_id_fk: 7, ...readingDto('2026-02-01', 2000), is_estimated: true, deleted: false };
    repo.findOne.mockResolvedValue(current);
    repo.find.mockResolvedValue([...existing, current]);
    await expect(service.update(3, { notes: 'x' }, 3)).resolves.toBeDefined();
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
    expect(summary.estimated_set_at).toBe(new Date('2026-02-10T00:00:00').toISOString());
    // Effettivo e finestra dallo storico (2/1–1/3/2026), mesi dal primo dato.
    expect(summary.coverage_days).toBe(59);
    expect(summary.window_end).toBe('2026-03-01');
    expect(summary.gaps).toEqual([]);
    expect(summary.monthly[0].month).toBe('2026-01');
  });
});
