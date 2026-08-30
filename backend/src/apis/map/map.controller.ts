import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';

@Controller('map')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MapController {
  constructor(private readonly service: MapService) {}

  @Get('points')
  getPoints(@Query() filters: MapQueryDto) {
    return this.service.getPoints(filters);
  }
}
