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
import { UtilityTypesService } from './utility-types.service';
import { UtilityType } from './entity/utility_type.entity';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { SearchUtilityTypeDto } from '@apis/utility-types/dto/search-utility-type.dto';
import { UpdateUtilityTypeDto } from '@apis/utility-types/dto/update-utility-type.dto';
import { DeleteDto } from '@apis/shared/dto/delete.dto';

@Controller('utility-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemUtilityTypesController {
  constructor(private readonly service: UtilityTypesService) {}

  @Get()
  getAll(@Query() filters: SearchUtilityTypeDto): Promise<UtilityType[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateUtilityTypeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<UtilityType> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUtilityTypeDto,
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
