import { BadRequestException } from '@nestjs/common';
import { PlantsService } from './plants.service';
import { InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';

describe('PlantsService', () => {
  let service: PlantsService;
  let repo: Record<string, jest.Mock>;
  let thermalRepo: Record<string, jest.Mock>;
  let elevatorRepo: Record<string, jest.Mock>;
  let inspectionRepo: Record<string, jest.Mock>;
  let fireRepo: Record<string, jest.Mock>;
  let assetRepo: Record<string, jest.Mock>;
  let utilityRepo: Record<string, jest.Mock>;

  const plant = (over: Record<string, unknown> = {}) => ({
    id: 1,
    type: PlantType.FOUNTAIN,
    code: 'fon_17',
    name: 'Fontana',
    assets: [],
    latitude: null,
    longitude: null,
    geocoded_latitude: '42.5',
    geocoded_longitude: '14.1',
    inspections: [],
    utilities: [],
    thermal: null,
    elevator: null,
    fireEquipment: [],
    deleted: false,
    ...over,
  });

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 9, ...d })),
    };
    thermalRepo = { save: jest.fn(async (d) => d), delete: jest.fn() };
    elevatorRepo = { save: jest.fn(async (d) => d), delete: jest.fn() };
    inspectionRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 5, ...d })),
      findOne: jest.fn(),
    };
    fireRepo = {
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 6, ...d })),
      findOne: jest.fn(),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(1) };
    utilityRepo = { count: jest.fn().mockResolvedValue(1) };
    service = new PlantsService(
      repo as never,
      thermalRepo as never,
      elevatorRepo as never,
      inspectionRepo as never,
      fireRepo as never,
      assetRepo as never,
      utilityRepo as never,
    );
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-02' as never);
  });

  it('riga con qualità della posizione e stato peggiore delle verifiche', async () => {
    repo.find.mockResolvedValue([
      plant({
        inspections: [
          { next_date: '2027-06-01', deleted: false },
          { next_date: '2026-11-01', deleted: false },
        ],
      }),
    ]);
    const [r] = await service.findAll({});
    expect(r.position_quality).toBe(PositionQuality.ESTIMATED);
    expect(r.inspection_status).toBe(InspectionStatus.DUE_SOON);
  });

  it('verifiche cancellate ignorate', async () => {
    repo.find.mockResolvedValue([
      plant({ inspections: [{ next_date: '2020-01-01', deleted: true }] }),
    ]);
    const [r] = await service.findAll({});
    expect(r.inspection_status).toBeNull();
    expect(r.inspections).toEqual([]);
  });

  it('filtro posizione mancante', async () => {
    repo.find.mockResolvedValue([
      plant(),
      plant({ id: 2, geocoded_latitude: null, geocoded_longitude: null }),
    ]);
    expect((await service.findAll({ position: 'missing' })).map((p) => p.id)).toEqual([2]);
  });

  it('termico: obblighi dalla potenza anche se MySQL la restituisce come stringa', async () => {
    repo.find.mockResolvedValue([
      plant({ type: PlantType.THERMAL, thermal: { power_kw: '120.00' } }),
    ]);
    const [r] = await service.findAll({});
    expect(r.obligations).toEqual({
      efficiency_check_required: true,
      inail_required: true,
      vvf_required: true,
    });
  });

  it('codice duplicato tra i non cancellati', async () => {
    repo.find.mockResolvedValue([{ id: 7, code: 'fon_17' }]);
    await expect(
      service.create({ type: PlantType.FOUNTAIN, code: 'fon_17', name: 'X' } as never, 3),
    ).rejects.toThrow(/fon_17/);
  });

  it('crea impianto termico con dati specifici e utenze', async () => {
    repo.findOne.mockResolvedValue(plant({ id: 9, type: PlantType.THERMAL }));
    await service.create(
      {
        type: PlantType.THERMAL,
        code: 'T1',
        name: 'Centrale',
        thermal: { power_kw: 120 },
        utility_ids: [4],
      } as never,
      3,
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'T1', utilities: [{ id: 4 }], created_by_user_id: 3 }),
    );
    expect(thermalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ plant_id: 9, power_kw: 120 }),
    );
  });

  it('ignora i dati specifici non coerenti con il tipo', async () => {
    repo.findOne.mockResolvedValue(plant({ id: 9 }));
    await service.create(
      { type: PlantType.FOUNTAIN, code: 'F1', name: 'F', thermal: { power_kw: 50 } } as never,
      3,
    );
    expect(thermalRepo.save).not.toHaveBeenCalled();
  });

  it('cambio tipo da termico a fontana: rimuove i dati termici', async () => {
    repo.findOne
      .mockResolvedValueOnce(plant({ id: 1, type: PlantType.THERMAL }))
      .mockResolvedValue(plant({ id: 1 }));
    await service.update(1, { type: PlantType.FOUNTAIN } as never, 3);
    expect(thermalRepo.delete).toHaveBeenCalledWith({ plant_id: 1 });
  });

  it('immobile inesistente', async () => {
    assetRepo.count.mockResolvedValue(0);
    await expect(
      service.create(
        { type: PlantType.FOUNTAIN, code: 'F2', name: 'F', asset_ids: [99] } as never,
        3,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea impianto collegato a più immobili', async () => {
    assetRepo.count.mockResolvedValue(2);
    repo.findOne.mockResolvedValue(plant({ id: 9 }));
    await service.create(
      { type: PlantType.THERMAL, code: 'T2', name: 'Centrale', asset_ids: [3, 4, 3] } as never,
      3,
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ assets: [{ id: 3 }, { id: 4 }] }),
    );
  });

  it('filtro per immobile: impianti che lo hanno tra gli immobili collegati', async () => {
    repo.find.mockResolvedValue([
      plant({ id: 1, assets: [{ id: 5 }] }),
      plant({ id: 2, assets: [{ id: 6 }, { id: 7 }] }),
    ]);
    expect((await service.findAll({ asset_id: 7 })).map((p) => p.id)).toEqual([2]);
  });

  it('posizione dal primo immobile collegato che ne ha una', async () => {
    const none = { latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null };
    repo.find.mockResolvedValue([
      plant({
        geocoded_latitude: null,
        geocoded_longitude: null,
        assets: [{ id: 5, ...none }, { id: 6, ...none, latitude: '42.7', longitude: '14.3' }],
      }),
    ]);
    const [r] = await service.findAll({});
    expect(r.position_quality).toBe(PositionQuality.FROM_ASSET);
    expect(r.position).toEqual({ lat: '42.7', lng: '14.3' });
  });

  it('utenza inesistente', async () => {
    utilityRepo.count.mockResolvedValue(0);
    await expect(
      service.create(
        { type: PlantType.FOUNTAIN, code: 'F3', name: 'F', utility_ids: [77] } as never,
        3,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifica: prossima data calcolata da ultima + periodicità se non indicata', async () => {
    repo.findOne.mockResolvedValue(plant());
    await service.addInspection(
      1,
      { kind: 'Controllo', period_months: 6, last_date: '2026-03-31' } as never,
      3,
    );
    expect(inspectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ plant_id: 1, next_date: '2026-09-30', created_by_user_id: 3 }),
    );
  });

  it('verifica: modifica dell’ultima data ricalcola la prossima', async () => {
    inspectionRepo.findOne.mockResolvedValue({
      id: 5,
      kind: 'Controllo',
      period_months: 12,
      last_date: '2025-01-10',
      next_date: '2026-01-10',
      deleted: false,
    });
    await service.updateInspection(5, { last_date: '2026-01-15' } as never, 3);
    expect(inspectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ next_date: '2027-01-15', updated_by_user_id: 3 }),
    );
  });

  it('presidi solo sugli impianti antincendio', async () => {
    repo.findOne.mockResolvedValue(plant());
    await expect(
      service.addFireEquipment(1, { equipment_type: 'EXTINGUISHER' } as never, 3),
    ).rejects.toThrow(/antincendio/);
  });

  it('summary', async () => {
    repo.find.mockResolvedValue([
      plant({ inspections: [{ next_date: '2026-01-01', deleted: false }] }),
      plant({
        id: 2,
        type: PlantType.THERMAL,
        geocoded_latitude: null,
        geocoded_longitude: null,
      }),
    ]);
    const s = await service.summary();
    expect(s.by_type[PlantType.FOUNTAIN]).toBe(1);
    expect(s.inspections_overdue).toBe(1);
    expect(s.without_position).toBe(1);
  });
});
