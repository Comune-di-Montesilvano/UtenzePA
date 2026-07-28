import { Controller, Get, UseGuards } from '@nestjs/common';
import { CostsBorneByService } from './costs-borne-by.service';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { CostsBorneBy } from '../shared/entities/utility_cost_borne_by.entity';

@Controller('costs-borne-by')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CostsBorneByController {
  constructor(private readonly service: CostsBorneByService) {}

  @Get()
  getAll(): Promise<CostsBorneBy[]> {
    return this.service.findAll();
  }
}
