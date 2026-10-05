import { MapController } from './map.controller';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { MapService } from './map.service';
import { SettingsService } from '@apis/settings/settings.service';

describe('MapController', () => {
  let controller: MapController;
  let geocodingService: { geocode: jest.Mock };
  let mapService: MapService;
  let settings: { getBrandingSummary: jest.Mock };

  beforeEach(() => {
    geocodingService = { geocode: jest.fn() };
    mapService = {} as MapService;
    settings = { getBrandingSummary: jest.fn().mockResolvedValue({ default_latitude: null, default_longitude: null }) };
    controller = new MapController(mapService, geocodingService as unknown as GeocodingService, settings as unknown as SettingsService);
  });

  it('geocode ritorna lat/lng quando Nominatim trova un match', async () => {
    geocodingService.geocode.mockResolvedValue({ lat: '42.5083', lon: '14.15' });

    const result = await controller.geocode({ q: 'Via Roma 1, Montesilvano' });

    expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano', undefined);
    expect(result).toEqual({ lat: '42.5083', lng: '14.15' });
  });

  it('geocode ritorna null quando Nominatim non trova nulla', async () => {
    geocodingService.geocode.mockResolvedValue(null);

    const result = await controller.geocode({ q: 'indirizzo inesistente' });

    expect(result).toBeNull();
  });

  it('cerca prima nel Comune (nome dal branding), poi vicino, poi ovunque', async () => {
    settings.getBrandingSummary.mockResolvedValue({
      entity_name: 'Comune di Montesilvano', default_latitude: '42.51', default_longitude: '14.14',
    });
    geocodingService.geocode
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: '41.9', lon: '12.5' });

    const result = await controller.geocode({ q: 'Via Roma' });

    expect(geocodingService.geocode).toHaveBeenNthCalledWith(1, 'Via Roma, Montesilvano', undefined);
    expect(geocodingService.geocode).toHaveBeenNthCalledWith(2, 'Via Roma', { viewbox: [14.04, 42.61, 14.24, 42.41] });
    expect(geocodingService.geocode).toHaveBeenNthCalledWith(3, 'Via Roma', undefined);
    expect(result).toEqual({ lat: '41.9', lng: '12.5' });
  });

  it('la città già nella ricerca non viene ripetuta', async () => {
    settings.getBrandingSummary.mockResolvedValue({ entity_name: 'Comune di Montesilvano' });
    geocodingService.geocode.mockResolvedValue({ lat: '42.5', lon: '14.15' });

    await controller.geocode({ q: 'via Roma 3, montesilvano' });

    expect(geocodingService.geocode).toHaveBeenCalledTimes(1);
    expect(geocodingService.geocode).toHaveBeenCalledWith('via Roma 3, montesilvano', undefined);
  });

  it('trovato vicino al Comune: una sola ricerca', async () => {
    settings.getBrandingSummary.mockResolvedValue({ default_latitude: '42,51', default_longitude: '14,14' });
    geocodingService.geocode.mockResolvedValue({ lat: '42.5', lon: '14.15' });

    await controller.geocode({ q: 'Via Roma' });

    expect(geocodingService.geocode).toHaveBeenCalledTimes(1);
  });
});
