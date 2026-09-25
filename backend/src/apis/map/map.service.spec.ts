import { In } from 'typeorm';
import { MapService } from './map.service';

describe('MapService', () => {
  let service: MapService;
  let assetRepo: { find: jest.Mock };
  let utilityRepo: { find: jest.Mock };

  beforeEach(() => {
    assetRepo = { find: jest.fn() };
    utilityRepo = { find: jest.fn() };
    service = new MapService(assetRepo as never, utilityRepo as never);
  });

  it('un asset con gps reale produce un punto source=gps', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([
      { id: 1, type: 'asset', name: 'Scuola A', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps', icon: null },
    ]);
    expect(ungeolocated).toEqual([]);
  });

  it('un asset senza gps ma con geocoded produce un punto source=geocoded', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 2, asset_name: 'Scuola B', address: 'Via Milano 2', latitude: null, longitude: null, geocoded_latitude: '42.6', geocoded_longitude: '14.2', asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({});

    expect(points[0].source).toBe('geocoded');
    expect(points[0].lat).toBe('42.6');
  });

  it('un asset senza indirizzo né gps finisce in ungeolocated con reason no_address', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 3, asset_name: 'Scuola C', address: null, latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([]);
    expect(ungeolocated).toEqual([{ id: 3, type: 'asset', name: 'Scuola C', reason: 'no_address' }]);
  });

  it('un asset con indirizzo ma geocoding fallito finisce in ungeolocated con reason geocode_failed', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 4, asset_name: 'Scuola D', address: 'Via Ignota 9', latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { ungeolocated } = await service.getPoints({});

    expect(ungeolocated).toEqual([{ id: 4, type: 'asset', name: 'Scuola D', reason: 'geocode_failed' }]);
  });

  it('una utility con gps proprio produce un punto indipendente', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 10, utility_id: 'UT-1', latitude: '42.9', longitude: '14.9', assets: [{ id: 1, asset_name: 'Scuola A', latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null }] },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 10, type: 'utility', name: 'UT-1', address: null, lat: '42.9', lng: '14.9', source: 'gps', assetId: 1 },
    ]);
  });

  it('una utility senza gps eredita la posizione (reale) dell\'asset collegato', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 11, utility_id: 'UT-2', latitude: null, longitude: null, assets: [{ id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null }] },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 11, type: 'utility', name: 'UT-2', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps', assetId: 1 },
    ]);
  });

  it('una utility senza gps il cui asset non ha posizione finisce in ungeolocated ereditando la reason', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 12, utility_id: 'UT-3', latitude: null, longitude: null, assets: [{ id: 1, asset_name: 'Scuola A', address: null, latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null }] },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([]);
    expect(ungeolocated).toEqual([{ id: 12, type: 'utility', name: 'UT-3', reason: 'no_address' }]);
  });

  it('un asset con aggregato che ha un\'icona custom la espone sul punto', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 5, asset_name: 'Scuola E', address: 'Via Torino 3', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3, assetAggregator: { id: 3, icon: 'school' } },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({});

    expect(points[0].icon).toBe('school');
  });

  it('assetAggregatorIds filtra anche le utility tramite l\'asset collegato', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([]);

    await service.getPoints({ assetAggregatorIds: [3, 4] });

    expect(utilityRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assets: { asset_type_id: In([3, 4]) } }),
      }),
    );
  });

  it('utilityTypeIds filtra anche gli IMMOBILI, non solo le utenze — solo asset con almeno una utenza del tipo', async () => {
    utilityRepo.find
      // Prima chiamata: query dedicata id-immobili-qualificanti.
      .mockResolvedValueOnce([{ assets: [{ id: 7 }] }, { assets: [{ id: 7 }] }, { assets: [{ id: 9 }] }])
      // Seconda chiamata: utenze per i punti mappa (stesso filtro, irrilevante qui).
      .mockResolvedValueOnce([]);
    assetRepo.find.mockResolvedValue([]);

    await service.getPoints({ utilityTypeIds: [5] });

    expect(assetRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: In([7, 9]) }),
      }),
    );
  });

  it('utilityTypeIds senza nessuna utenza corrispondente esclude tutti gli immobili (sentinella, non "IN ()")', async () => {
    utilityRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    assetRepo.find.mockResolvedValue([]);

    await service.getPoints({ utilityTypeIds: [999] });

    expect(assetRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: In([-1]) }),
      }),
    );
  });

  it('showAssets=false esclude gli asset dai risultati', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({ showAssets: false });

    expect(assetRepo.find).not.toHaveBeenCalled();
    expect(points).toEqual([]);
  });
  it('icona immobile: funzione se presente, altrimenti vecchio aggregato', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 5, asset_name: 'A', address: 'x', latitude: '42.5', longitude: '14.1', assetFunction: { icon: 'sports_soccer' }, assetAggregator: { icon: 'school' } },
      { id: 6, asset_name: 'B', address: 'x', latitude: '42.6', longitude: '14.2', assetFunction: null, assetAggregator: { icon: 'school' } },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({});

    expect(points.map((p) => p.icon)).toEqual(['sports_soccer', 'school']);
  });

  it('natureIds/functionIds/statuses filtrano immobili e utenze (via immobili collegati)', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([]);

    await service.getPoints({ natureIds: [1], functionIds: [2], statuses: ['Attivo'] as never });

    const assetWhere = { nature_id: In([1]), function_id: In([2]), status: In(['Attivo']) };
    expect(assetRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(assetWhere) }),
    );
    expect(utilityRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assets: expect.objectContaining(assetWhere) }),
      }),
    );
  });

  it('utenza senza gps collegata a due immobili produce un punto per ciascuno', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      {
        id: 20, utility_id: 'UT-20', latitude: null, longitude: null,
        assets: [
          { id: 1, address: 'Via A', latitude: '42.1', longitude: '14.1' },
          { id: 2, address: 'Via B', latitude: '42.2', longitude: '14.2' },
        ],
      },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([
      { id: 20, type: 'utility', name: 'UT-20', address: 'Via A', lat: '42.1', lng: '14.1', source: 'gps', assetId: 1 },
      { id: 20, type: 'utility', name: 'UT-20', address: 'Via B', lat: '42.2', lng: '14.2', source: 'gps', assetId: 2 },
    ]);
    expect(ungeolocated).toEqual([]);
  });

  it('utenza con gps proprio e due immobili produce un solo punto (assetId = primo)', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 21, utility_id: 'UT-21', latitude: '43.0', longitude: '15.0', assets: [{ id: 1, address: 'Via A' }, { id: 2, address: 'Via B' }] },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 21, type: 'utility', name: 'UT-21', address: 'Via A', lat: '43.0', lng: '15.0', source: 'gps', assetId: 1 },
    ]);
  });

  it('utenza con un immobile localizzabile e uno no: punto solo sul primo, nessuna voce ungeolocated', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 22, utility_id: 'UT-22', latitude: null, longitude: null, assets: [{ id: 1, address: 'Via A', latitude: '42.1', longitude: '14.1' }, { id: 2, address: null }] },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points.map((p) => p.assetId)).toEqual([1]);
    expect(ungeolocated).toEqual([]);
  });

  it('utenza senza posizione su nessun immobile compare una sola volta in ungeolocated', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 23, utility_id: 'UT-23', latitude: null, longitude: null, assets: [{ id: 1, address: 'Via A' }, { id: 2, address: null }] },
    ]);

    const { ungeolocated } = await service.getPoints({});

    expect(ungeolocated).toEqual([{ id: 23, type: 'utility', name: 'UT-23', reason: 'geocode_failed' }]);
  });
});
