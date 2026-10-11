import { BadRequestException } from '@nestjs/common';
import { ComplexesService } from './complexes.service';
import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';

describe('ComplexesService', () => {
  let service: ComplexesService;
  let repo: Record<string, jest.Mock>;
  let assetRepo: Record<string, jest.Mock>;
  let utilityRepo: Record<string, jest.Mock>;
  let plantRepo: Record<string, jest.Mock>;
  let grantRepo: Record<string, jest.Mock>;

  const complex = (over: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'Palazzina via Salieri',
    complex_type: null,
    deleted: false,
    assets: [],
    ...over,
  });
  const asset = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    asset_name: `imm_${id}`,
    complex_id: 1,
    deleted: false,
    ...over,
  });

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 1, ...d })),
    };
    assetRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    };
    utilityRepo = { find: jest.fn().mockResolvedValue([]) };
    plantRepo = { find: jest.fn().mockResolvedValue([]) };
    grantRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new ComplexesService(
      repo as never,
      assetRepo as never,
      utilityRepo as never,
      plantRepo as never,
      grantRepo as never,
    );
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-11' as never);
  });

  it('conteggi: immobili non cancellati, utenze e impianti distinti, contratti attivi o in scadenza', async () => {
    repo.find.mockResolvedValue([
      complex({ assets: [asset(10), asset(11), asset(12, { deleted: true })] }),
    ]);
    // Utenza 100 su due immobili dello stesso complesso: conta una volta.
    utilityRepo.find.mockResolvedValue([
      { id: 100, assets: [asset(10), asset(11)] },
      { id: 101, assets: [asset(11)] },
    ]);
    plantRepo.find.mockResolvedValue([{ id: 200, assets: [asset(10)] }]);
    grantRepo.find.mockResolvedValue([
      { id: 300, status: ContractStatus.ACTIVE, end_date: '2027-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(10)] },
      { id: 301, status: ContractStatus.ACTIVE, end_date: '2020-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
      { id: 302, status: ContractStatus.RETURNED, end_date: null, tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
    ]);

    const [row] = await service.findAll({});

    expect(row).toMatchObject({ asset_count: 2, utility_count: 2, plant_count: 1, active_grant_count: 1 });
  });

  it('findAll filtra per testo su nome e indirizzo', async () => {
    repo.find.mockResolvedValue([
      complex({ id: 1, name: 'Plesso Rodari' }),
      complex({ id: 2, name: 'Altro', address: 'via Rodari' }),
      complex({ id: 3, name: 'Stadio' }),
    ]);

    const rows = await service.findAll({ q: 'rodari' });

    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('create collega gli immobili spostandoli da un altro complesso', async () => {
    assetRepo.count.mockResolvedValue(2);
    repo.findOne.mockResolvedValue(complex({ id: 1 }));

    await service.create({ name: 'Nuovo', asset_ids: [10, 11] }, 7);

    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: 1 });
  });

  it('create rifiuta immobili inesistenti o cancellati', async () => {
    assetRepo.count.mockResolvedValue(1);

    await expect(service.create({ name: 'Nuovo', asset_ids: [10, 99] }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('update con asset_ids scollega quelli tolti e collega quelli nuovi', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10), asset(11)] }));
    assetRepo.count.mockResolvedValue(2);

    await service.update(1, { asset_ids: [11, 12] }, 7);

    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: null });
    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: 1 });
  });

  it('update senza asset_ids lascia invariati gli immobili', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10)] }));

    await service.update(1, { name: 'Rinominato' }, 7);

    expect(assetRepo.update).not.toHaveBeenCalled();
  });

  it('remove con immobili collegati: 400 con il numero', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10), asset(11)] }));

    await expect(service.remove(1, 7)).rejects.toThrow(
      'Il complesso ha 2 immobili collegati: scollegali prima di eliminarlo',
    );
  });

  it('create con Id compendio MEF già usato: 400 con il complesso', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 9, name: 'Plesso Rodari', mef_compendium_id: 48200 }));

    await expect(service.create({ name: 'Nuovo', mef_compendium_id: 48200 }, 7)).rejects.toThrow(
      'Id compendio MEF 48200 già usato dal complesso «Plesso Rodari»',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update con Id compendio MEF di un altro complesso: 400', async () => {
    repo.findOne.mockImplementation(async ({ where }) =>
      where.mef_compendium_id ? complex({ id: 9, name: 'Plesso Rodari' }) : complex({ id: 1 }),
    );

    await expect(service.update(1, { mef_compendium_id: 48200 }, 7)).rejects.toThrow(BadRequestException);
  });

  it('update con il proprio Id compendio MEF: nessun errore', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, mef_compendium_id: 48200 }));

    await expect(service.update(1, { mef_compendium_id: 48200 }, 7)).resolves.toBeDefined();
  });

  it('findOneOrFail su complesso inesistente: 400 «Complesso non trovato»', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.findOneOrFail(99)).rejects.toThrow('Complesso non trovato');
  });

  it('remove ignora gli immobili cancellati', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10, { deleted: true })] }));

    await service.remove(1, 7);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, deleted: true }));
  });
  it('grants: contratti degli immobili con lo stato mostrato', async () => {
    grantRepo.find.mockResolvedValue([
      { id: 301, status: ContractStatus.ACTIVE, end_date: '2020-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
    ]);

    const rows = await service.grants(1);

    expect(grantRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted: false, assets: { complex_id: 1, deleted: false } } }),
    );
    expect(rows[0].computed_status).toBe('EXPIRED');
  });
});
