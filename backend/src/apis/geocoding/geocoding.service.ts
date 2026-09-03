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
const MIN_DELAY_MS = 1500;
// Il throttle rispetta gia' il limite documentato di Nominatim (1 req/sec),
// ma in pratica il server pubblico risponde comunque 429 sotto carico
// (osservato: ~85% delle richieste in un batch di refresh massivo, dopo un
// primo giro con molte richieste ravvicinate — sembra un ban temporaneo
// sull'IP, non solo pacing). Serve quindi retry con backoff esponenziale.
// L'header Retry-After di Nominatim e' stato osservato tornare '0' anche
// mentre continua a rispondere 429 subito dopo — non va MAI usato da solo
// come unico backoff, sempre in max() con quello esponenziale calcolato qui,
// altrimenti il retry riparte senza nessuna attesa reale.
//
// Un 429 non e' un fallimento del dato (indirizzo non trovato) — e' il
// servizio che chiede di aspettare. Va quindi ritentato per un budget di
// tempo lungo (non un numero fisso di tentativi, che con backoff esponenziale
// si esaurirebbe in meno di un minuto) prima di rinunciare — solo gli altri
// errori (404/indirizzo non trovato, rete) falliscono subito.
const MAX_RATE_LIMIT_RETRY_MS = 15 * 60 * 1000;
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60000;

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
    const rateLimitDeadline = Date.now() + MAX_RATE_LIMIT_RETRY_MS;
    let attempt = 0;

    for (;;) {
      await this.throttle();

      try {
        const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
        });

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : NaN;
          const exponentialMs = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
          const backoffMs = Number.isFinite(retryAfterMs)
            ? Math.max(retryAfterMs, exponentialMs)
            : exponentialMs;

          if (Date.now() + backoffMs >= rateLimitDeadline) {
            this.logger.warn(
              `Nominatim 429 persistente da ${Math.round(MAX_RATE_LIMIT_RETRY_MS / 60000)} minuti per "${query}", rinuncio`,
            );
            return null;
          }

          this.logger.warn(`Nominatim 429 per "${query}", retry tra ${backoffMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          attempt++;
          continue;
        }

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
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}
