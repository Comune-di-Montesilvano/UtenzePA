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
import { ComplexesService, ComplexRow } from './complexes.service';
import { CreateComplexDto } from './dto/create-complex.dto';
import { UpdateComplexDto } from './dto/update-complex.dto';
import { SearchComplexDto } from './dto/search-complex.dto';

@Controller('complexes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplexesController {
  constructor(private readonly service: ComplexesService) {}

  @Get()
  list(@Query() filters: SearchComplexDto): Promise<ComplexRow[]> {
    return this.service.findAll(filters);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<ComplexRow | null> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateComplexDto, @CurrentUser() user: ICurrentUser): Promise<ComplexRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComplexDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ComplexRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
