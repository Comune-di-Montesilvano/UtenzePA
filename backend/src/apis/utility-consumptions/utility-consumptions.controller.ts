import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UtilityConsumptionsService, UtilityConsumptionRow, UtilityConsumptionSummary } from './utility-consumptions.service';
import { CreateUtilityConsumptionDto } from './dto/create-utility-consumption.dto';
import { UpdateUtilityConsumptionDto } from './dto/update-utility-consumption.dto';
import { UtilityConsumption } from './entity/utility-consumption.entity';

// Route annidate sotto utilities/:utilityId (lista/creazione/riepilogo) e
// dirette su utility-consumptions/:id (modifica/eliminazione).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilityConsumptionsController {
  constructor(private readonly service: UtilityConsumptionsService) {}

  @Get('utilities/:utilityId/consumptions')
  list(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<UtilityConsumptionRow[]> {
    return this.service.findByUtility(utilityId);
  }

  @Get('utilities/:utilityId/consumption-summary')
  summary(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<UtilityConsumptionSummary> {
    return this.service.getSummary(utilityId);
  }

  @Roles('Admin', 'Operatore')
  @Post('utilities/:utilityId/consumptions')
  create(
    @Param('utilityId', ParseIntPipe) utilityId: number,
    @Body() dto: CreateUtilityConsumptionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<UtilityConsumption> {
    return this.service.createForUtility(utilityId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('utility-consumptions/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUtilityConsumptionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<UtilityConsumption> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('utility-consumptions/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
