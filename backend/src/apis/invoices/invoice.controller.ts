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
import { InvoicesService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SearchInvoiceDto } from './dto/search-invoice.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { Invoice } from './entity/invoice.entity';
import { DeleteInvoiceDto } from '@apis/invoices/dto/delete-invoice.dto';
import { maskSupplierOf } from '@apis/third-parties/third-party.privacy';

const maskInvoice = (i: Invoice, role?: string): Invoice =>
  i?.contratto ? { ...i, contratto: maskSupplierOf(i.contratto, role) } : i;

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  // Fornitore del contratto persona fisica: CF e telefono oscurati per il Lettore.
  async getAll(
    @Query() filters: SearchInvoiceDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Invoice[]> {
    return (await this.service.findAll(filters)).map((i) => maskInvoice(i, user?.role));
  }

  @Get('/monthly-costs')
  getMonthlyExpenditure(): Promise<number> {
    return this.service.getMonthlyCosts();
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Invoice> {
    return maskInvoice(await this.service.findOne(id), user?.role);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: ICurrentUser): Promise<Invoice> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Invoice> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteInvoiceDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
