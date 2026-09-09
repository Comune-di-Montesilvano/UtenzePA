import { MapController } from './map.controller';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { MapService } from './map.service';

describe('MapController', () => {
  let controller: MapController;
  let geocodingService: { geocode: jest.Mock };
  let mapService: MapService;

  beforeEach(() => {
    geocodingService = { geocode: jest.fn() };
    mapService = {} as MapService;
    controller = new MapController(mapService, geocodingService as unknown as GeocodingService);
  });

  it('geocode ritorna lat/lng quando Nominatim trova un match', async () => {
    geocodingService.geocode.mockResolvedValue({ lat: '42.5083', lon: '14.15' });

    const result = await controller.geocode({ q: 'Via Roma 1, Montesilvano' });

    expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano');
    expect(result).toEqual({ lat: '42.5083', lng: '14.15' });
  });

  it('geocode ritorna null quando Nominatim non trova nulla', async () => {
    geocodingService.geocode.mockResolvedValue(null);

    const result = await controller.geocode({ q: 'indirizzo inesistente' });

    expect(result).toBeNull();
  });
});
