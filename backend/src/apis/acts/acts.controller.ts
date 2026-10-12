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
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ActRow, ActsService } from './acts.service';
import { CreateActDto } from './dto/create-act.dto';
import { UpdateActDto } from './dto/update-act.dto';
import { SearchActDto } from './dto/search-act.dto';
import { ActLinkDto } from './dto/act-link.dto';
import { ActLinkEntity, LINK_ENTITIES } from './act-links';

@Controller('acts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActsController {
  constructor(private readonly service: ActsService) {}

  @Get()
  list(@Query() filters: SearchActDto): Promise<ActRow[]> {
    return this.service.findAll(filters);
  }

  @Get('by-entity/:entity/:id')
  byEntity(
    @Param('entity') entity: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ActRow[]> {
    if (!(LINK_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException('Entità non valida');
    }
    return this.service.byEntity(entity as ActLinkEntity, id);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<ActRow> {
    return this.service.findOneOrFail(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateActDto, @CurrentUser() user: ICurrentUser): Promise<ActRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ActRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/restore')
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ActRow> {
    return this.service.restore(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/links')
  link(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.link(id, dto.entity, dto.id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id/links')
  unlink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.unlink(id, dto.entity, dto.id, user.id);
  }
}
