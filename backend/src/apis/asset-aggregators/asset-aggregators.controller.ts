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
import { AssetAggregatorsService } from './asset-aggregators.service';
import { CreateAssetAggregatorDto } from './dto/create-asset-aggregator.dto';
import { UpdateAssetAggregatorDto } from './dto/update-asset-aggregator.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { AssetAggregator } from './entity/asset-aggregator.entity';
import { SearchAssetAggregatorDto } from './dto/search-asset-aggregator.dto';
import { DeleteDto } from '@apis/shared/dto/delete.dto';

@Controller('asset-aggregators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetAggregatorsController {
  constructor(private readonly service: AssetAggregatorsService) {}

  @Get()
  getAll(@Query() filters: SearchAssetAggregatorDto): Promise<AssetAggregator[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateAssetAggregatorDto, @CurrentUser() user: ICurrentUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateAssetAggregatorDto,
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
