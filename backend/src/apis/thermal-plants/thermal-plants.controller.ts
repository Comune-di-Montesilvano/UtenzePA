import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ThermalPlantsService, ThermalPlantRow } from './thermal-plants.service';
import { ThermalPlant } from './entity/thermal-plant.entity';
import { CreateThermalPlantDto } from './dto/create-thermal-plant.dto';
import { UpdateThermalPlantDto } from './dto/update-thermal-plant.dto';

// Elenco completo su thermal-plants (vista dedicata), route annidate sotto
// assets/:assetId (lista/creazione) e utilities/:utilityId (impianti
// alimentati), dirette su thermal-plants/:id (modifica/eliminazione).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThermalPlantsController {
  constructor(private readonly service: ThermalPlantsService) {}

  @Get('thermal-plants')
  listAll(): Promise<ThermalPlantRow[]> {
    return this.service.findAllRows();
  }

  @Get('assets/:assetId/thermal-plants')
  listByAsset(@Param('assetId', ParseIntPipe) assetId: number): Promise<ThermalPlantRow[]> {
    return this.service.findByAsset(assetId);
  }

  @Get('utilities/:utilityId/thermal-plants')
  listByUtility(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<ThermalPlantRow[]> {
    return this.service.findByUtility(utilityId);
  }

  @Roles('Admin', 'Operatore')
  @Post('assets/:assetId/thermal-plants')
  create(
    @Param('assetId', ParseIntPipe) assetId: number,
    @Body() dto: CreateThermalPlantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThermalPlant> {
    return this.service.createForAsset(assetId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('thermal-plants/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateThermalPlantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThermalPlant> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('thermal-plants/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
