import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { UpdateInvoiceImportDto } from './dto/update-invoice-import.dto';
import { InvoiceImportService, type InvoiceImportStatus } from './invoice-import.service';

@Controller('invoice-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class InvoiceImportController {
  constructor(private readonly service: InvoiceImportService) {}

  @Get('status')
  status(): Promise<InvoiceImportStatus> {
    return this.service.getStatus();
  }

  @Patch()
  async update(@Body() dto: UpdateInvoiceImportDto): Promise<InvoiceImportStatus> {
    await this.service.setEnabled(dto.enabled);
    return this.service.getStatus();
  }

  // Giro immediato in background (il primo può durare minuti): la risposta
  // arriva subito con running = true, l'esito si legge da GET status.
  @Post('run')
  async run(): Promise<InvoiceImportStatus> {
    if (!this.service.configured) throw new BadRequestException('Import non configurato.');
    const status = await this.service.getStatus();
    if (status.forcedOff || !status.enabled) throw new BadRequestException('Import spento.');
    if (this.service.isRunning) throw new BadRequestException('Import già in corso.');
    void this.service.runOnce();
    return { ...status, running: true };
  }
}
