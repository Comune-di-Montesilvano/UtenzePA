import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Anomalies, AnomaliesService } from './anomalies.service';

@Controller('anomalies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnomaliesController {
  constructor(private readonly service: AnomaliesService) {}

  @Get()
  getAll(): Promise<Anomalies> {
    return this.service.getAnomalies();
  }
}
