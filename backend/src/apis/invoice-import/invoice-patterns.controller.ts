import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, type ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { contentDisposition } from '@apis/attachments/attachment-file-policy';
import {
  IgnoreInvoiceStructureDto,
  AnalyzeInvoicePatternDto,
  PreviewInvoicePatternDto,
  SaveInvoicePatternDto,
} from './dto/save-invoice-pattern.dto';
import { InvoicePatternsService } from './invoice-patterns.service';

// Lettura e anteprima per tutti i ruoli; salvataggi Admin e Operatore (come le fatture).
@Controller('invoice-patterns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicePatternsController {
  constructor(private readonly service: InvoicePatternsService) {}

  @Get('unknown')
  unknown() {
    return this.service.unknown();
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get('messages/:id/editor')
  editor(@Param('id', ParseIntPipe) id: number) {
    return this.service.editor(id);
  }

  @Get('messages/:id/pdf')
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.service.pdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(pdf.fileName, true),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(pdf.data);
  }

  @Post('preview')
  preview(@Body() dto: PreviewInvoicePatternDto) {
    return this.service.preview(dto.message_id, dto.rules);
  }

  @Post('analyze')
  analyze(@Body() dto: AnalyzeInvoicePatternDto) {
    return this.service.analyze(dto.message_id, dto.message_ids, dto.rules);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: SaveInvoicePatternDto, @CurrentUser() user: ICurrentUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post('issues/:id/mute')
  async muteIssue(@Param('id', ParseIntPipe) id: number) {
    await this.service.muteIssue(id);
    return { ok: true };
  }

  @Roles('Admin', 'Operatore')
  @Post('ignore')
  ignore(@Body() dto: IgnoreInvoiceStructureDto, @CurrentUser() user: ICurrentUser) {
    return this.service.ignore(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveInvoicePatternDto,
    @CurrentUser() user: ICurrentUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser) {
    await this.service.remove(id, user.id);
    return { ok: true };
  }
}
