import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';
import { MapGeocodeQueryDto } from './dto/map-geocode-query.dto';
import { SettingsService } from '@apis/settings/settings.service';

// Mezza ampiezza (gradi) del riquadro attorno al Comune per la ricerca indirizzi.
const AREA_DELTA = 0.1;
const round = (n: number) => Math.round(n * 100) / 100;

@Controller('map')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MapController {
  constructor(
    private readonly service: MapService,
    private readonly geocodingService: GeocodingService,
    private readonly settings: SettingsService,
  ) {}

  @Get('points')
  getPoints(@Query() filters: MapQueryDto) {
    return this.service.getPoints(filters);
  }

  // Ricerca libera indirizzo (barra ricerca mappa) — riusa lo stesso client
  // Nominatim/throttle/backoff usato per il geocoding batch degli asset
  // (GeocodingService), nessun secondo client HTTP duplicato. Ritorna
  // lat/lng string (coerente con MapPoint) o null se nessun match.
  @Get('geocode')
  async geocode(@Query() query: MapGeocodeQueryDto): Promise<{ lat: string; lng: string } | null> {
    // Prima vicino al Comune (coordinate di default del branding: "via Roma"
    // senza città resta a Montesilvano), poi ovunque.
    const { default_latitude, default_longitude } = await this.settings.getBrandingSummary();
    const lat = parseFloat(String(default_latitude ?? '').replace(',', '.'));
    const lng = parseFloat(String(default_longitude ?? '').replace(',', '.'));
    let result = null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      result = await this.geocodingService.geocode(query.q, {
        viewbox: [round(lng - AREA_DELTA), round(lat + AREA_DELTA), round(lng + AREA_DELTA), round(lat - AREA_DELTA)],
      });
    }
    result ??= await this.geocodingService.geocode(query.q, undefined);
    return result ? { lat: result.lat, lng: result.lon } : null;
  }
}
