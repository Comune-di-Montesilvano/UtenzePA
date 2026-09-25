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
import { AssetFunctionsService } from './asset-functions.service';
import { AssetFunction } from './entity/asset-function.entity';
import { CreateAssetFunctionDto } from './dto/create-asset-function.dto';
import { UpdateAssetFunctionDto } from './dto/update-asset-function.dto';
import { SearchAssetFunctionDto } from './dto/search-asset-function.dto';

@Controller('asset-functions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetFunctionsController {
  constructor(private readonly service: AssetFunctionsService) {}

  @Get()
  getAll(@Query() filters: SearchAssetFunctionDto): Promise<AssetFunction[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateAssetFunctionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetFunction> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetFunctionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetFunction> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
