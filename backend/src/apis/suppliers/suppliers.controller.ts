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
import { SuppliersService } from './suppliers.service';
import { Supplier } from '../shared/entities/supplier.entity';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SearchSupplierDto } from '@apis/suppliers/dto/search-supplier.dto';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  getAll(@Query() filters: SearchSupplierDto): Promise<Supplier[]> {
    return this.service.findAll(filters);
  }

  @Get('counter')
  counter(): Promise<number> {
    return this.service.count();
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() SupplierDto: CreateSupplierDto, @CurrentUser() user: ICurrentUser) {
    return this.service.create(SupplierDto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.service.update(id, updateSupplierDto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateSupplierDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
