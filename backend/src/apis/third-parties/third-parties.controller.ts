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
import { ThirdPartiesService, ThirdPartyRow } from './third-parties.service';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';
import { SearchThirdPartyDto } from './dto/search-third-party.dto';
import { maskParty } from './third-party.privacy';
import { ThirdParty } from './entity/third-party.entity';

// CF e telefono delle persone fisiche oscurati per i ruoli diversi da Admin/Operatore.
@Controller('third-parties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThirdPartiesController {
  constructor(private readonly service: ThirdPartiesService) {}

  @Get()
  async getAll(
    @Query() filters: SearchThirdPartyDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThirdPartyRow[]> {
    return (await this.service.findAll(filters)).map((p) => maskParty(p, user?.role));
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThirdPartyRow | null> {
    const p = await this.service.findOne(id);
    return p ? maskParty(p, user?.role) : null;
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateThirdPartyDto, @CurrentUser() user: ICurrentUser): Promise<ThirdParty> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateThirdPartyDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThirdParty> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
