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
import { UtilityAggregatorsService } from './utility-aggregators.service';
import { CreateUtilityAggregatorDto } from './dto/create-utility-aggregator.dto';
import { UpdateUtilityAggregatorDto } from './dto/update-utility-aggregator.dto';
import { SearchUtilityAggregatorDto } from './dto/search-utility-aggregator.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UtilityAggregator } from './entity/utility-aggregator.entity';
import { DeleteDto } from '@apis/shared/dto/delete.dto';

@Controller('utility-aggregators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilityAggregatorsController {
  constructor(private readonly service: UtilityAggregatorsService) {}

  @Get()
  getAll(@Query() filters: SearchUtilityAggregatorDto): Promise<UtilityAggregator[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateUtilityAggregatorDto, @CurrentUser() user: ICurrentUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateUtilityAggregatorDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
