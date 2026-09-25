import { AssetsService } from './assets.service';
import { Asset } from './entity/asset.entity';

describe('AssetsService', () => {
  let service: AssetsService;
  let repo: { createQueryBuilder: jest.Mock; findOne?: jest.Mock; save?: jest.Mock; update?: jest.Mock };
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
      { createQueryBuilder: jest.fn() } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(natureQb) } as never,
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

      expect(result).toBe(assets);
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
      (repo as any).findOne = jest.fn().mockResolvedValue({ id: 1, address: 'Via Roma 1' } as Asset);
      (repo as any).save = jest.fn().mockResolvedValue(undefined);
      (repo as any).update = jest.fn().mockResolvedValue(undefined);
      qb.getOne.mockResolvedValue({ id: 1, address: 'Via Vecchia 2' } as Asset);
      service = new AssetsService(
        repo as never,
        geocodingService as never,
        { createQueryBuilder: jest.fn() } as never,
        { createQueryBuilder: jest.fn() } as never,
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
      await service.update(1, { address: 'Via Nuova 5', latitude: '42.1', longitude: '14.2' } as never);

      const savedEntity = (repo.save as jest.Mock).mock.calls[0][0];
      expect(savedEntity.geocoded_latitude).toBeUndefined();
      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it("non rilancia il geocoding se l'indirizzo non cambia", async () => {
      await service.update(1, { ownership: 1 } as never);

      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it("non rilancia il geocoding se il valore di indirizzo inviato è uguale a quello già persistito (payload full-form invariato)", async () => {
      await service.update(1, { address: 'Via Roma 1' } as never);

      expect(geocodingService.geocode).not.toHaveBeenCalled();
    });

    it("rilancia il geocoding se il valore di indirizzo inviato differisce da quello persistito", async () => {
      await service.update(1, { address: 'Via Roma 1', civic_number: '10' } as never);

      expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano');
    });

    it('non fa fallire il save se il geocoding va in errore', async () => {
      geocodingService.geocode.mockRejectedValue(new Error('nominatim down'));

      await expect(service.update(1, { address: 'Via Nuova 5' } as never)).resolves.toBeDefined();
    });
  });

  describe('AssetsService — audit label resolver', () => {
    it('mappa asset_type_id su AssetAggregator.code, non su description', () => {
      const assetAggregatorRepo = { createQueryBuilder: jest.fn() };
      service = new AssetsService(
        repo as never,
        { buildQuery: jest.fn(), geocode: jest.fn() } as never,
        assetAggregatorRepo as never,
        { createQueryBuilder: jest.fn() } as never,
      );

      const resolver = (service as any).auditLabelResolvers?.asset_type_id;
      expect(resolver).toBeDefined();
      expect(resolver.field).toBe('code');
    });
  });
  describe('classificazione', () => {
    beforeEach(() => {
      (repo as any).save = jest.fn(async (d) => d);
    });

    it('findAll e findOne joinano natura, funzione e vecchio aggregato', async () => {
      await service.findAll();
      await service.findOne(1);
      for (const [path, alias] of [
        ['assets.assetNature', 'assetNature'],
        ['assets.assetFunction', 'assetFunction'],
        ['assets.assetAggregator', 'assetAggregator'],
      ]) {
        const calls = qb.leftJoinAndSelect.mock.calls.filter((c) => c[0] === path && c[1] === alias);
        expect(calls).toHaveLength(2);
      }
    });

    it('findAll con legacy_only filtra asset_type_id non nullo e non lo passa ad applyFilters', async () => {
      await service.findAll({ legacy_only: true } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('assets.asset_type_id IS NOT NULL');
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

    it('update con tipologia e funzione valorizzate azzera il vecchio tipo', async () => {
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await service.update(5, { nature_id: 1, function_id: 2 } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ asset_type_id: null, nature_id: 1, function_id: 2 }),
      );
    });

    it('update con sola natura non azzera il vecchio tipo', async () => {
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await service.update(5, { nature_id: 1 } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ asset_type_id: 3, nature_id: 1 }),
      );
    });

    it('update parziale (solo funzione) valida contro la natura già salvata', async () => {
      (repo as any).findOne = jest
        .fn()
        .mockResolvedValue({ id: 5, asset_type_id: null, nature_id: 1, function_id: 2 });

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
        .mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await expect(service.update(5, { function_id: 2 } as never, 1)).rejects.toThrow(
        'Selezionare la tipologia prima della funzione.',
      );
    });

    it('countLegacy conta gli immobili non cancellati con asset_type_id valorizzato', async () => {
      qb.getCount.mockResolvedValue(42);
      await expect(service.countLegacy()).resolves.toBe(42);
      expect(qb.where).toHaveBeenCalledWith('assets.deleted = 0');
      expect(qb.andWhere).toHaveBeenCalledWith('assets.asset_type_id IS NOT NULL');
    });
  });
});
