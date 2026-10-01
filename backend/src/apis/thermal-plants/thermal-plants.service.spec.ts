import { BadRequestException } from '@nestjs/common';
import { ThermalPlantsService } from './thermal-plants.service';

describe('ThermalPlantsService', () => {
  let service: ThermalPlantsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let assetRepo: { findOne: jest.Mock };
  let utilityRepo: { findOne: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 99, ...data })),
    };
    assetRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, deleted: false }) };
    utilityRepo = { findOne: jest.fn().mockResolvedValue({ id: 12, deleted: false }) };
    service = new ThermalPlantsService(repo as never, assetRepo as never, utilityRepo as never);
  });

  it('elenca gli impianti dell’immobile con gli obblighi calcolati dalla potenza', async () => {
    repo.find.mockResolvedValue([{ id: 1, asset_id_fk: 7, name: 'Centrale', power_kw: '170.00' }]);
    const [row] = await service.findByAsset(7);
    expect(row.power_kw).toBe(170);
    expect(row).toEqual(
      expect.objectContaining({
        vvf_required: true,
        inail_required: true,
        efficiency_check_required: true,
      }),
    );
  });

  it('crea un impianto collegato all’immobile e all’utenza gas', async () => {
    await service.createForAsset(7, { name: 'Centrale', power_kw: 80, utility_id_fk: 12 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        asset_id_fk: 7,
        utility_id_fk: 12,
        power_kw: 80,
        created_by_user_id: 3,
      }),
    );
  });

  it('rifiuta un immobile inesistente', async () => {
    assetRepo.findOne.mockResolvedValue(null);
    await expect(service.createForAsset(7, { name: 'Centrale' }, 3)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta un’utenza inesistente', async () => {
    utilityRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForAsset(7, { name: 'Centrale', utility_id_fk: 12 }, 3),
    ).rejects.toThrow(/Utenza/);
  });

  it('accetta un impianto senza utenza (es. pompa di calore)', async () => {
    await service.createForAsset(7, { name: 'Pompa di calore', utility_id_fk: null }, 3);
    expect(utilityRepo.findOne).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });

  it('elenca gli impianti alimentati da un’utenza', async () => {
    repo.find.mockResolvedValue([
      { id: 1, asset_id_fk: 7, utility_id_fk: 12, name: 'Centrale', power_kw: null },
    ]);
    const rows = await service.findByUtility(12);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { utility_id_fk: 12, deleted: false } }),
    );
    expect(rows[0].vvf_required).toBe(false);
  });

  it('elenca tutti gli impianti con immobile e utenza, ordinati per immobile', async () => {
    repo.find.mockResolvedValue([
      { id: 2, name: 'B', power_kw: '20.00', asset: { asset_name: 'Scuola' } },
      { id: 1, name: 'A', power_kw: '200.00', asset: { asset_name: 'Municipio' } },
    ]);
    const rows = await service.findAllRows();
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deleted: false },
        relations: { asset: true, utility: true },
      }),
    );
    expect(rows.map((r) => r.asset.asset_name)).toEqual(['Municipio', 'Scuola']);
    expect(rows[0].vvf_required).toBe(true);
  });
});
