import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GeocodingService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  describe('buildQuery', () => {
    it('combina address, civic_number, zip_code, municipality', () => {
      const query = service.buildQuery({
        address: 'Via Roma',
        civic_number: '10',
        zip_code: '65015',
        municipality: 'Montesilvano',
      } as never);

      expect(query).toBe('Via Roma 10, 65015 Montesilvano');
    });

    it('ritorna null se nessun campo indirizzo è valorizzato', () => {
      const query = service.buildQuery({
        address: null,
        civic_number: null,
        zip_code: null,
        municipality: null,
      } as never);

      expect(query).toBeNull();
    });

    it('omette i campi mancanti senza lasciare separatori vuoti', () => {
      const query = service.buildQuery({
        address: 'Via Roma',
        civic_number: null,
        zip_code: null,
        municipality: 'Montesilvano',
      } as never);

      expect(query).toBe('Via Roma, Montesilvano');
    });
  });

  describe('geocode', () => {
    it('ritorna lat/lon dal primo risultato Nominatim', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '42.5083', lon: '14.1500' }],
      });

      const result = await service.geocode('Via Roma 10, Montesilvano');

      expect(result).toEqual({ lat: '42.5083', lon: '14.1500' });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('nominatim.openstreetmap.org/search');
      expect(url).toContain(encodeURIComponent('Via Roma 10, Montesilvano'));
      expect(options.headers['User-Agent']).toContain('UtenzePA');
    });

    it('ritorna null se Nominatim non trova nulla', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

      const result = await service.geocode('indirizzo inesistente');

      expect(result).toBeNull();
    });

    it('ritorna null se la chiamata HTTP fallisce', async () => {
      fetchMock.mockRejectedValue(new Error('network error'));

      const result = await service.geocode('Via Roma 10');

      expect(result).toBeNull();
    });

    it('ritorna null se la risposta HTTP non è ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => [] });

      const result = await service.geocode('Via Roma 10');

      expect(result).toBeNull();
    });
  });

  describe('throttle', () => {
    it('aspetta almeno 1.1s tra due chiamate consecutive', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [{ lat: '1', lon: '1' }] });
      const start = Date.now();

      await service.geocode('indirizzo 1');
      await service.geocode('indirizzo 2');

      expect(Date.now() - start).toBeGreaterThanOrEqual(1100);
    });
  });
});
