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
      { id: 1, type: 'asset', name: 'Scuola A', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps' },
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
      { id: 10, utility_id: 'UT-1', latitude: '42.9', longitude: '14.9', asset: { id: 1, asset_name: 'Scuola A', latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 10, type: 'utility', name: 'UT-1', address: null, lat: '42.9', lng: '14.9', source: 'gps' },
    ]);
  });

  it('una utility senza gps eredita la posizione (reale) dell\'asset collegato', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 11, utility_id: 'UT-2', latitude: null, longitude: null, asset: { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 11, type: 'utility', name: 'UT-2', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps' },
    ]);
  });

  it('una utility senza gps il cui asset non ha posizione finisce in ungeolocated ereditando la reason', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 12, utility_id: 'UT-3', latitude: null, longitude: null, asset: { id: 1, asset_name: 'Scuola A', address: null, latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([]);
    expect(ungeolocated).toEqual([{ id: 12, type: 'utility', name: 'UT-3', reason: 'no_address' }]);
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
});
