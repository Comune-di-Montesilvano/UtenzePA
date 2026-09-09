import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';
import { MapGeocodeQueryDto } from './dto/map-geocode-query.dto';

@Controller('map')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MapController {
  constructor(
    private readonly service: MapService,
    private readonly geocodingService: GeocodingService,
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
    const result = await this.geocodingService.geocode(query.q);
    return result ? { lat: result.lat, lng: result.lon } : null;
  }
}
