import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ActTypesService } from './act-types.service';
import { ActType } from './entity/act-type.entity';
import { CreateActTypeDto } from './dto/create-act-type.dto';
import { UpdateActTypeDto } from './dto/update-act-type.dto';

@Controller('act-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActTypesController {
  constructor(private readonly service: ActTypesService) {}

  @Get()
  list(): Promise<ActType[]> {
    return this.service.findAll();
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateActTypeDto, @CurrentUser() user: ICurrentUser): Promise<ActType> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActTypeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ActType> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
