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
import { CreateUtilizerGrantDto } from './dto/create-utilizer-grant.dto';
import { UpdateUtilizerGrantDto } from './dto/update-utilizer-grant.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { SearchUtilizerGrantDto } from '@apis/utilizer-grant/dto/search-utilizer-grant.dto';
import { maskContract } from './real-estate-contract.privacy';
import {
  ContractRow,
  ContractSummary,
  UtilizerGrantService,
} from '@apis/utilizer-grant/utilizer-grant.service';

// Contratti immobiliari (ex concessioni): path invariato.
@Controller('utilizer-grant')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilizerGrantController {
  constructor(private readonly service: UtilizerGrantService) {}

  // Codice fiscale della controparte oscurato per i ruoli diversi da Admin/Operatore.
  @Get()
  async getAll(
    @Query() filters: SearchUtilizerGrantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ContractRow[]> {
    return (await this.service.findAll(filters)).map((g) => maskContract(g, user?.role));
  }

  // Prima di ':id', altrimenti 'summary' verrebbe letto come id.
  @Get('summary')
  summary(): Promise<ContractSummary> {
    return this.service.summary();
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ContractRow | null> {
    const g = await this.service.findOne(id);
    return g
      ? {
          ...maskContract(g, user?.role),
          parent: g.parent ? maskContract(g.parent, user?.role) : null,
          children: (g.children ?? []).map((c) => maskContract(c, user?.role)),
        }
      : null;
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateUtilizerGrantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ContractRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUtilizerGrantDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ContractRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
