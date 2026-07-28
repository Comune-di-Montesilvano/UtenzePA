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
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetDto } from './dto/search-asset.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { Asset } from './entity/asset.entity';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';

@Controller('building')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  getAll(@Query() filters: SearchAssetDto): Promise<Asset[]> {
    return this.service.findAll(filters);
  }

  @Get('counter')
  counter(): Promise<number> {
    return this.service.count();
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: ICurrentUser): Promise<Asset> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Asset> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateAssetDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
