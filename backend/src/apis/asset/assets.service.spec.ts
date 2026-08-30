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
  };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service = new AssetsService(repo as never, {
      buildQuery: jest.fn(),
      geocode: jest.fn(),
    } as never);
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
      service = new AssetsService(repo as never, geocodingService as never);
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

    it('non fa fallire il save se il geocoding va in errore', async () => {
      geocodingService.geocode.mockRejectedValue(new Error('nominatim down'));

      await expect(service.update(1, { address: 'Via Nuova 5' } as never)).resolves.toBeDefined();
    });
  });
});
