import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { PlantsService, PlantRow, PlantSummary } from './plants.service';
import { CreatePlantDto } from './dto/create-plant.dto';
import { UpdatePlantDto } from './dto/update-plant.dto';
import { SearchPlantDto } from './dto/search-plant.dto';
import { CreatePlantInspectionDto, UpdatePlantInspectionDto } from './dto/plant-inspection.dto';
import {
  CreatePlantFireEquipmentDto,
  UpdatePlantFireEquipmentDto,
} from './dto/plant-fire-equipment.dto';
import { PlantInspection } from './entity/plant-inspection.entity';
import { PlantFireEquipment } from './entity/plant-fire-equipment.entity';

// Le rotte statiche (summary, inspections/:id, fire-equipment/:id) vanno
// dichiarate prima di :id.
@Controller('plants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlantsController {
  constructor(private readonly service: PlantsService) {}

  @Get()
  list(@Query() filters: SearchPlantDto): Promise<PlantRow[]> {
    return this.service.findAll(filters);
  }

  @Get('summary')
  summary(): Promise<PlantSummary> {
    return this.service.summary();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<PlantRow | null> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreatePlantDto, @CurrentUser() user: ICurrentUser): Promise<PlantRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('inspections/:inspId')
  updateInspection(
    @Param('inspId', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantInspectionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<PlantInspection> {
    return this.service.updateInspection(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('fire-equipment/:eqId')
  updateFireEquipment(
    @Param('eqId', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantFireEquipmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<PlantFireEquipment> {
    return this.service.updateFireEquipment(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<PlantRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('inspections/:inspId')
  removeInspection(
    @Param('inspId', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.removeInspection(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('fire-equipment/:eqId')
  removeFireEquipment(
    @Param('eqId', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.removeFireEquipment(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/inspections')
  addInspection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePlantInspectionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<PlantInspection> {
    return this.service.addInspection(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/fire-equipment')
  addFireEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePlantFireEquipmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<PlantFireEquipment> {
    return this.service.addFireEquipment(id, dto, user.id);
  }
}
