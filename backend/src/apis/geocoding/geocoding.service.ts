import { Injectable, Logger } from '@nestjs/common';

interface AddressLike {
  address: string | null;
  civic_number: string | null;
  zip_code: string | null;
  municipality: string | null;
}

interface GeocodeResult {
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'UtenzePA/1.0 (Comune di Montesilvano; gestionale patrimonio interno)';
const MIN_DELAY_MS = 1100;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastCallAt = 0;

  buildQuery(asset: AddressLike): string | null {
    const streetPart = [asset.address, asset.civic_number].filter(Boolean).join(' ');
    const cityPart = [asset.zip_code, asset.municipality].filter(Boolean).join(' ');
    const parts = [streetPart, cityPart].filter((part) => part.trim().length > 0);

    if (parts.length === 0) return null;
    return parts.join(', ');
  }

  async geocode(query: string): Promise<GeocodeResult | null> {
    await this.throttle();

    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim ha risposto ${response.status} per "${query}"`);
        return null;
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (results.length === 0) {
        return null;
      }

      return { lat: results[0].lat, lon: results[0].lon };
    } catch (error) {
      this.logger.warn(`Geocoding fallito per "${query}": ${error?.message ?? error}`);
      return null;
    }
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}
