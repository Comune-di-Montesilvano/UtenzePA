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
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { PurposeService } from '@apis/purpose/purpose.service';
import { Purpose } from '@apis/purpose/entity/purpose.entity';
import { CreatePurposeDto } from '@apis/purpose/dto/create-purpose.dto';
import { UpdatePurposeDto } from '@apis/purpose/dto/update-purpose.dto';
import { SearchPurposeDto } from '@apis/purpose/dto/search-purpose.dto';

@Controller('purpose')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurposeController {
  constructor(private readonly service: PurposeService) {}

  @Get()
  getAll(@Query() filters: SearchPurposeDto): Promise<Purpose[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreatePurposeDto, @CurrentUser() user: ICurrentUser): Promise<Purpose> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdatePurposeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Purpose> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdatePurposeDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
