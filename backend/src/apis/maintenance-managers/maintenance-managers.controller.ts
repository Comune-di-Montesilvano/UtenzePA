import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { MaintenanceManagersService } from './maintenance-managers.service';
import { CreateMaintenanceManagerDto } from './dto/create-maintenance-managers.dto';
import { UpdateMaintenanceManagerDto } from './dto/update-maintenance-managers.dto';
import { MaintenanceManager } from '../shared/entities/maintenanceManagers.entity';

import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';

@Controller('maintenance-managers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceManagersController {
  constructor(private readonly service: MaintenanceManagersService) {}

  @Get()
  getAll(@Query() filters: any): Promise<MaintenanceManager[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateMaintenanceManagerDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<MaintenanceManager> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateMaintenanceManagerDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<MaintenanceManager> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    const updatedByUserId = 1;
    await this.service.remove(id, updatedByUserId);
  }
}
