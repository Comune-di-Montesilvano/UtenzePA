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
import { CreateUtilizerDto } from './dto/create-utilizer.dto';
import { UpdateUtilizerDto } from './dto/update-utilizer.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { Utilizer } from './entity/utilizer.entity';
import { SearchUtilizerGrantDto } from '@apis/utilizer-grant/dto/search-utilizer-grant.dto';
import { UtilizerService } from '@apis/utilizer/utilizer.service';

@Controller('utilizer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly service: UtilizerService) {}

  @Get()
  getAll(@Query() filters: SearchUtilizerGrantDto): Promise<Utilizer[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateUtilizerDto, @CurrentUser() user: ICurrentUser): Promise<Utilizer> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateUtilizerDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Utilizer> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateUtilizerDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
