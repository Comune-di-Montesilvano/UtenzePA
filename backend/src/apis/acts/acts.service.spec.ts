import { ActsService } from './acts.service';
import { BaseService } from '@apis/shared/base.service';
import { In } from 'typeorm';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(async (x) => ({ id: 10, ...x })),
  createQueryBuilder: jest.fn(),
  update: jest.fn(),
});

const act = (extra = {}) => ({
  id: 10,
  act_type_id: 1,
  subject: 'Acquisizione immobili',
  act_date: '2024-04-03',
  deleted: false,
  assets: [],
  plants: [],
  utilizerGrants: [],
  contracts: [],
  ...extra,
});

describe('ActsService', () => {
  let acts: ReturnType<typeof repo>;
  let types: ReturnType<typeof repo>;
  let targets: Record<string, ReturnType<typeof repo>>;
  let attachments: { countByEntity: jest.Mock };
  let service: ActsService;

  beforeEach(() => {
    acts = repo();
    types = repo();
    targets = { asset: repo(), plant: repo(), utilizer_grant: repo(), contract: repo() };
    attachments = { countByEntity: jest.fn().mockResolvedValue(new Map()) };
    service = new ActsService(
      acts as never,
      types as never,
      targets.asset as never,
      targets.plant as never,
      targets.utilizer_grant as never,
      targets.contract as never,
      attachments as never,
    );
    types.findOne.mockResolvedValue({ id: 1, name: 'Delibera di Giunta', deleted: false });
  });

  afterEach(() => jest.restoreAllMocks());

  it('create: tipo inesistente → 400', async () => {
    types.findOne.mockResolvedValue(null);
    await expect(service.create({ act_type_id: 99, subject: 'x' }, 1)).rejects.toThrow(
      'Tipo di atto non trovato',
    );
  });

  it('create: oggetto solo spazi → 400', async () => {
    await expect(service.create({ act_type_id: 1, subject: '   ' }, 1)).rejects.toThrow(
      "L'oggetto è obbligatorio",
    );
  });

  it('create: immobile inesistente o cancellato → 400', async () => {
    targets.asset.count.mockResolvedValue(1);
    await expect(
      service.create({ act_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1),
    ).rejects.toThrow('Immobile non trovato');
    expect(targets.asset.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ deleted: false }),
    });
  });

  it('create con collegamenti validi: solo le relazioni inviate', async () => {
    targets.asset.count.mockResolvedValue(2);
    acts.findOne.mockResolvedValue(act());
    await service.create({ act_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1);
    const saved = acts.save.mock.calls[0][0];
    expect(saved.assets).toEqual([{ id: 3 }, { id: 4 }]);
    expect(saved.plants).toBeUndefined();
    expect(saved.asset_ids).toBeUndefined();
  });

  it('update senza collegamenti: relazioni non toccate', async () => {
    acts.findOne.mockResolvedValue(act({ assets: [{ id: 3 }] }));
    jest.spyOn(BaseService.prototype, 'update').mockResolvedValue(act() as never);
    await service.update(10, { subject: 'Nuovo oggetto' }, 1);
    expect(acts.save).not.toHaveBeenCalled();
  });

  it('link già presente e unlink assente: nessun salvataggio', async () => {
    acts.findOne.mockResolvedValue(act({ assets: [{ id: 3, deleted: false }] }));
    targets.asset.count.mockResolvedValue(1);
    await service.link(10, 'asset', 3, 1);
    await service.unlink(10, 'asset', 4, 1);
    expect(acts.save).not.toHaveBeenCalled();
  });

  it('link su atto cancellato → 400', async () => {
    acts.findOne.mockResolvedValue(null);
    await expect(service.link(10, 'asset', 3, 1)).rejects.toThrow('Atto non trovato');
  });

  it('findAll: conteggi (file, collegamenti non cancellati) e filtri', async () => {
    acts.find.mockResolvedValue([
      act({
        id: 1,
        assets: [
          { id: 3, deleted: false },
          { id: 4, deleted: true },
        ],
      }),
      act({ id: 2, act_date: '2019-01-10' }),
    ]);
    attachments.countByEntity.mockResolvedValue(new Map([[1, 2]]));
    const all = await service.findAll({});
    expect(all.map((a) => [a.id, a.file_count, a.link_count])).toEqual([
      [1, 2, 1],
      [2, 0, 0],
    ]);
    expect((await service.findAll({ without_files: true })).map((a) => a.id)).toEqual([2]);
    expect((await service.findAll({ linked_to: 'none' })).map((a) => a.id)).toEqual([2]);
    expect((await service.findAll({ linked_to: 'asset' })).map((a) => a.id)).toEqual([1]);
    expect((await service.findAll({ year: 2019 })).map((a) => a.id)).toEqual([2]);
  });

  it('byEntity: atti con tutti i loro collegamenti (non solo quello cercato)', async () => {
    acts.find
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([act({ id: 1 }), act({ id: 2 })]);
    await service.byEntity('asset', 3);
    expect(acts.find.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: { deleted: false, assets: { id: 3 } },
        select: { id: true },
      }),
    );
    expect(acts.find.mock.calls[1][0].where).toEqual({ id: In([1, 2]) });
  });

  it('byEntity senza atti: una sola query', async () => {
    acts.find.mockResolvedValueOnce([]);
    expect(await service.byEntity('asset', 3)).toEqual([]);
    expect(acts.find).toHaveBeenCalledTimes(1);
  });

  it('link/unlink: modifica solo la riga di collegamento (niente riscrittura della relazione)', async () => {
    const add = jest.fn();
    const remove = jest.fn();
    acts.createQueryBuilder.mockReturnValue({
      relation: () => ({ of: () => ({ add, remove }) }),
    });
    targets.asset.count.mockResolvedValue(1);
    acts.findOne.mockResolvedValue(act({ assets: [{ id: 5, deleted: false }] }));
    await service.link(10, 'asset', 3, 1);
    await service.unlink(10, 'asset', 5, 1);
    expect(add).toHaveBeenCalledWith(3);
    expect(remove).toHaveBeenCalledWith(5);
    expect(acts.save).not.toHaveBeenCalled();
    expect(acts.update).toHaveBeenCalledWith(10, { updated_by_user_id: 1 });
  });

  it('PATCH *_ids: i collegamenti a entità cancellate (non visibili) restano', async () => {
    acts.findOne.mockResolvedValue(
      act({
        assets: [
          { id: 3, deleted: true },
          { id: 5, deleted: false },
        ],
      }),
    );
    targets.asset.count.mockResolvedValue(1);
    jest.spyOn(BaseService.prototype, 'update').mockResolvedValue(act() as never);
    await service.update(10, { asset_ids: [4] }, 1);
    expect(acts.save.mock.calls[0][0].assets).toEqual([{ id: 4 }, { id: 3 }]);
  });

  it('byEntity: atti non cancellati collegati all’entità', async () => {
    acts.find.mockResolvedValueOnce([]);
    await service.byEntity('contract', 7);
    expect(acts.find.mock.calls[0][0].where).toEqual({ deleted: false, contracts: { id: 7 } });
  });

  it('scheda: di autore e ultimo modificatore solo nome e cognome', async () => {
    const user = { id: 2, firstName: 'Anna', lastName: 'Bianchi', email: 'x', otp: '123456' };
    acts.findOne.mockResolvedValue(act({ created_by: user, updated_by: user }));
    const a = await service.findOneOrFail(10);
    expect(a.created_by).toEqual({ firstName: 'Anna', lastName: 'Bianchi' });
    expect(a.updated_by).toEqual({ firstName: 'Anna', lastName: 'Bianchi' });
  });

  it('scheda: del fornitore solo il nome (niente codice fiscale ai Lettori)', async () => {
    acts.findOne.mockResolvedValue(
      act({
        contracts: [
          {
            id: 5,
            cig_contract: 'Z123',
            deleted: false,
            supplier: { type: 'NATURAL', last_name: 'Rossi', first_name: 'Mario', tax_code: 'X' },
          },
        ],
      }),
    );
    const a = await service.findOneOrFail(10);
    expect(a.contracts[0]).toEqual({ id: 5, cig_contract: 'Z123', supplier_name: 'Rossi Mario' });
  });
});
