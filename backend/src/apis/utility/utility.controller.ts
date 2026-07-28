import {
  BadRequestException,
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
import { UtilitiesService } from './utility.service';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { Utility } from './entity/utility.entity';
import { SearchUtilityDto } from './dto/search-utility.dto';

@Controller('utilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilitiesController {
  constructor(private readonly service: UtilitiesService) {}

  @Get()
  getAll(@Query() filters: SearchUtilityDto): Promise<Utility[]> {
    return this.service.findAll(filters);
  }

  @Get('counter')
  counter(): Promise<number> {
    return this.service.count();
  }

  @Get('safeguarded')
  safeguard(): Promise<Utility[]> {
    return this.service.findBySafeguard();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number): Promise<Utility> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateUtilityDto, @CurrentUser() user: ICurrentUser): Promise<Utility> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUtilityDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Utility> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUtilityDto): Promise<void> {
    if (!dto.updated_by_user_id) {
      throw new BadRequestException('ID utente che effettua la cancellazione mancante.');
    }
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
