import { AssetsService } from './assets.service';
import { Asset } from './entity/asset.entity';

describe('AssetsService', () => {
  let service: AssetsService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne?: jest.Mock;
    save?: jest.Mock;
    update?: jest.Mock;
  };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
    getOne: jest.Mock;
    getCount: jest.Mock;
  };
  let natureQb: { innerJoin: jest.Mock; where: jest.Mock; getCount: jest.Mock };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
    };
    natureQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new AssetsService(
      repo as never,
      {
        buildQuery: jest.fn(),
        geocode: jest.fn(),
      } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(natureQb) } as never,
      {} as never,
      {} as never,
    );
  });

  describe('findAll', () => {
    it('filtra i soli asset non cancellati di default', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('assets.deleted = :deleted_default', {
        deleted_default: 0,
      });
    });

    it('rispetta il filtro deleted esplicito', async () => {
      await service.findAll({ deleted: true } as never);

      expect(qb.where).toHaveBeenCalledWith('assets.deleted = :deleted_filter', {
        deleted_filter: 1,
      });
    });

    it('ordina per id ascendente', async () => {
      await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('assets.id', 'ASC');
    });

    it('restituisce il risultato della query', async () => {
      const assets = [{ id: 1 } as Asset];
      qb.getMany.mockResolvedValue(assets);

      const result = await service.findAll();

      expect(result).toEqual([expect.objectContaining({ id: 1, mef: expect.any(Object) })]);
    });
  });

  describe('findOne', () => {
    it('filtra per id e restituisce un singolo asset', async () => {
      const asset = { id: 7 } as Asset;
      qb.getOne.mockResolvedValue(asset);

      const result = await service.findOne(7);

      expect(qb.where).toHaveBeenCalledWith('assets.id = :id', { id: 7 });
      expect(result).toBe(asset);
    });

    it('restituisce null se non trovato', async () => {
      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    let geocodingService: { buildQuery: jest.Mock; geocode: jest.Mock };

    beforeEach(() => {
      geocodingService = {
        buildQuery: jest.fn().mockReturnValue('Via Roma 1, Montesilvano'),
        geocode: jest.fn().mockResolvedValue({ lat: '42.5', lon: '14.1' }),
      };
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 1, address: 'Via Roma 1' } as Asset);
      (repo as any).save = jest.fn().mockResolvedValue(undefined);
      (repo as any).update = jest.fn().mockResolvedValue(undefined);
      qb.getOne.mockResolvedValue({ id: 1, address: 'Via Vecchia 2' } as Asset);
      service = new AssetsService(
        repo as never,
        geocodingService as never,
        { createQueryBuilder: jest.fn() } as never,
        {} as never,
        {} as never,
      );
    });

    it("azzera i campi geocoded e rilancia il geocoding se cambia l'indirizzo senza gps manuale", async () => {
      await service.update(1, { address: 'Via Nuova 5' } as never);

      const savedEntity = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedEntity.geocoded_latitude).toBeNull();
      expect(savedEntity.geocoded_longitude).toBeNull();
      expect(savedEntity.geocoded_at).toBeNull();
      expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano');
    });

    it('non tocca i campi geocoded se viene fornito un gps manuale insieme al nuovo indirizzo', async () => {
      await service.update(1, {
        address: 'Via Nuova 5',
        latitude: '42.1',
        longitude: '14.2',
      } as never);

      const savedEntity = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedEntity.geocoded_latitude).toBeUndefined();
      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it("non rilancia il geocoding se l'indirizzo non cambia", async () => {
      await service.update(1, { ownership: 1 } as never);

      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it('non rilancia il geocoding se il valore di indirizzo inviato è uguale a quello già persistito (payload full-form invariato)', async () => {
      await service.update(1, { address: 'Via Roma 1' } as never);

      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it('rilancia il geocoding se il valore di indirizzo inviato differisce da quello persistito', async () => {
      await service.update(1, { address: 'Via Roma 1', civic_number: '10' } as never);

      expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano');
    });

    it('non fa fallire il save se il geocoding va in errore', async () => {
      geocodingService.geocode.mockRejectedValue(new Error('nominatim down'));

      await expect(service.update(1, { address: 'Via Nuova 5' } as never)).resolves.toBeDefined();
    });
  });

  describe('AssetsService — audit label resolver', () => {
    it('etichetta la natura col nome, nessun resolver per il vecchio tipo', () => {
      service = new AssetsService(
        repo as never,
        { buildQuery: jest.fn(), geocode: jest.fn() } as never,
        { createQueryBuilder: jest.fn() } as never,
        {} as never,
        {} as never,
      );

      const resolvers = (service as any).auditLabelResolvers;
      expect(resolvers.nature_id.field).toBe('name');
      expect(resolvers.asset_type_id).toBeUndefined();
      expect(resolvers.complex_id.field).toBe('name');
    });
  });
  describe('classificazione', () => {
    beforeEach(() => {
      (repo as any).save = jest.fn(async (d) => d);
    });

    it('findAll e findOne joinano natura e funzione, non il vecchio aggregato', async () => {
      await service.findAll();
      await service.findOne(1);
      for (const [path, alias] of [
        ['assets.assetNature', 'assetNature'],
        ['assets.assetFunction', 'assetFunction'],
      ]) {
        const calls = qb.leftJoinAndSelect.mock.calls.filter(
          (c) => c[0] === path && c[1] === alias,
        );
        expect(calls).toHaveLength(2);
      }
      expect(qb.leftJoinAndSelect.mock.calls.some((c) => c[0] === 'assets.assetAggregator')).toBe(
        false,
      );
    });

    it('findAll e findOne joinano il complesso non cancellato', async () => {
      await service.findAll();
      await service.findOne(1);
      const calls = qb.leftJoinAndSelect.mock.calls.filter(
        (c) => c[0] === 'assets.complex' && c[1] === 'complex' && c[2] === 'complex.deleted = 0',
      );
      expect(calls).toHaveLength(2);
    });

    it('findAll con complex_id filtra per uguaglianza', async () => {
      await service.findAll({ complex_id: 5 } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('assets.complex_id = :filter_complex_id', {
        filter_complex_id: 5,
      });
    });

    it('findAll con legacy_only filtra gli immobili senza natura o funzione e non lo passa ad applyFilters', async () => {
      await service.findAll({ legacy_only: true } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(assets.nature_id IS NULL OR assets.function_id IS NULL)',
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('legacy_only'),
        expect.anything(),
      );
    });

    it('findAll con status filtra per uguaglianza esatta', async () => {
      await service.findAll({ status: 'Dismesso' } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('assets.status = :filter_status', {
        filter_status: 'Dismesso',
      });
    });

    it('create rifiuta una coppia natura/funzione non ammessa', async () => {
      natureQb.getCount.mockResolvedValue(0);
      await expect(
        service.create({ asset_name: 'X', nature_id: 1, function_id: 9 } as never, 1),
      ).rejects.toThrow('Combinazione tipologia/funzione non ammessa.');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('update parziale (solo funzione) valida contro la natura già salvata', async () => {
      (repo as any).findOne = jest.fn().mockResolvedValue({ id: 5, nature_id: 1, function_id: 2 });

      await service.update(5, { function_id: 4 } as never, 1);

      expect(natureQb.where).toHaveBeenCalledWith('n.id = :natureId AND n.deleted = 0', {
        natureId: 1,
      });
      expect(natureQb.innerJoin).toHaveBeenCalledWith(
        'n.functions',
        'f',
        'f.id = :functionId AND f.deleted = 0',
        { functionId: 4 },
      );
    });

    it('update con funzione senza natura rifiuta', async () => {
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 5, nature_id: null, function_id: null });

      await expect(service.update(5, { function_id: 2 } as never, 1)).rejects.toThrow(
        'Selezionare la tipologia prima della funzione.',
      );
    });

    it('countLegacy conta gli immobili non cancellati senza natura o funzione', async () => {
      qb.getCount.mockResolvedValue(42);
      await expect(service.countLegacy()).resolves.toBe(42);
      expect(qb.where).toHaveBeenCalledWith('assets.deleted = 0');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(assets.nature_id IS NULL OR assets.function_id IS NULL)',
      );
    });
  });

  describe('unità catastali e dati MEF', () => {
    let unitRepo: { find: jest.Mock; delete: jest.Mock; save: jest.Mock };
    let audit: { record: jest.Mock };

    beforeEach(() => {
      unitRepo = {
        find: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn(async (rows) => rows),
      };
      audit = { record: jest.fn() };
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 1, nature_id: null, function_id: null });
      (repo as any).save = jest.fn(async (d) => ({ id: 9, ...d }));
      (repo as any).create = jest.fn((d) => d);
      service = new AssetsService(
        repo as never,
        { buildQuery: jest.fn(), geocode: jest.fn() } as never,
        { createQueryBuilder: jest.fn().mockReturnValue(natureQb) } as never,
        {} as never,
        unitRepo as never,
      );
      (service as any).auditLogService = audit;
    });

    const unit = { sheet: '16', parcel: '200', subordinate: '3', category: 'A/3' };

    it('update con cadastral_units sostituisce le unità e registra il cambio', async () => {
      unitRepo.find.mockResolvedValue([{ id: 4, asset_id: 1, sheet: '16', parcel: '200' }]);

      await service.update(1, { cadastral_units: [unit] } as never, 7);

      expect(unitRepo.delete).toHaveBeenCalledWith({ asset_id: 1 });
      expect(unitRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ asset_id: 1, ...unit }),
      ]);
      const fields = audit.record.mock.calls.flatMap((c) => c[0].fields ?? []);
      expect(fields).toContainEqual(expect.objectContaining({ fieldName: 'cadastral_units' }));
      const saved = (repo.save as jest.Mock).mock.calls[0][0];
      expect(saved.cadastral_units).toBeUndefined();
    });

    it('update con le stesse unità non registra cambi sulle unità', async () => {
      unitRepo.find.mockResolvedValue([
        { id: 4, asset_id: 1, section: null, cadastral_income: null, ...unit },
      ]);

      await service.update(1, { cadastral_units: [unit] } as never, 7);

      const fields = audit.record.mock.calls.flatMap((c) => c[0].fields ?? []);
      expect(fields).not.toContainEqual(expect.objectContaining({ fieldName: 'cadastral_units' }));
    });

    it('update senza cadastral_units non tocca le unità', async () => {
      await service.update(1, { asset_name: 'X' } as never, 7);

      expect(unitRepo.find).not.toHaveBeenCalled();
      expect(unitRepo.delete).not.toHaveBeenCalled();
      expect(unitRepo.save).not.toHaveBeenCalled();
    });

    it('create salva le unità sul nuovo immobile', async () => {
      await service.create({ asset_name: 'X', ownership: 1, cadastral_units: [unit] } as never, 7);

      expect(unitRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ asset_id: 9, ...unit }),
      ]);
    });

    it('findAll e findOne joinano le unità catastali', async () => {
      await service.findAll();
      await service.findOne(1);
      const calls = qb.leftJoinAndSelect.mock.calls.filter(
        (c) => c[0] === 'assets.cadastralUnits' && c[1] === 'cadastralUnits',
      );
      expect(calls).toHaveLength(2);
    });

    it('findAll con foglio cerca tra le unità e non sulla colonna dell’immobile', async () => {
      await service.findAll({ sheet: '16' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS (SELECT 1 FROM asset_cadastral_units'),
        { filter_unit_sheet: '16' },
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('assets.sheet'),
        expect.anything(),
      );
    });

    it('findAll con utilizzo filtra sul dato MEF calcolato', async () => {
      qb.getMany.mockResolvedValue([
        { id: 1, ownership: 1, status: 'Attivo', utilizerGrants: [] },
        {
          id: 2,
          ownership: 1,
          status: 'Attivo',
          utilizerGrants: [
            {
              id: 5,
              direction: 'ACTIVE',
              status: 'ACTIVE',
              end_date: '2999-01-01',
              tacit_renewal: false,
              renewal_months: null,
              notice_months: null,
            },
          ],
        },
      ]);

      const rows = await service.findAll({ usage: 'THIRD_PARTIES' } as never);

      expect(rows.map((r) => r.id)).toEqual([2]);
      expect((rows[0] as any).mef.usage_grant_id).toBe(5);
    });
  });
});
