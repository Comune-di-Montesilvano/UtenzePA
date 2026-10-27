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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { contentDisposition } from '@apis/attachments/attachment-file-policy';
import { InvoiceImportService } from '@apis/invoice-import/invoice-import.service';
import { SdiDocumentQueryDto } from './dto/sdi-document-query.dto';
import { InvoiceListRow, InvoicesService } from './invoice.service';
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

// Fornitore persona fisica (della fattura o del contratto): CF e telefono
// oscurati per il Lettore.
const maskInvoice = (i: Invoice, role?: string): Invoice => {
  if (!i) return i;
  const masked = maskSupplierOf(i, role);
  return masked.contratto ? { ...masked, contratto: maskSupplierOf(masked.contratto, role) } : masked;
};

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly invoiceImport: InvoiceImportService,
  ) {}

  @Get()
  // Fornitore del contratto persona fisica: CF e telefono oscurati per il Lettore.
  async getAll(
    @Query() filters: SearchInvoiceDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Invoice[]> {
    return (await this.service.findAll(filters)).map((i) => maskInvoice(i, user?.role));
  }

  // Elenco leggero (senza righe né quote): pagina Fatture e tab Fatture delle
  // schede. Del fornitore solo il nome, nulla da oscurare.
  @Get('/list')
  list(@Query() filters: SearchInvoiceDto): Promise<InvoiceListRow[]> {
    return this.service.findList(filters);
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

  // XML o PDF della fattura riletti dalla PEC dello SDI, per la sola visualizzazione.
  @Get(':id/sdi-document')
  async sdiDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SdiDocumentQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const doc = await this.invoiceImport.getDocument(id, query.type);
    res.set({
      'Content-Type': doc.contentType,
      'Content-Disposition': contentDisposition(doc.fileName, true),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(doc.data);
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
