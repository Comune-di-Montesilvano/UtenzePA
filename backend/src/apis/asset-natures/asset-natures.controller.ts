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
import { DeleteDto } from '@apis/shared/dto/delete.dto';
import { AssetNaturesService } from './asset-natures.service';
import { AssetNature } from './entity/asset-nature.entity';
import { CreateAssetNatureDto } from './dto/create-asset-nature.dto';
import { UpdateAssetNatureDto } from './dto/update-asset-nature.dto';
import { SearchAssetNatureDto } from './dto/search-asset-nature.dto';

@Controller('asset-natures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetNaturesController {
  constructor(private readonly service: AssetNaturesService) {}

  @Get()
  getAll(@Query() filters: SearchAssetNatureDto): Promise<AssetNature[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateAssetNatureDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetNature> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetNatureDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetNature> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
