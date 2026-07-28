import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';

@Controller('importer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataImporterController {
  constructor(private readonly service: DataImporterService) {}

  @Get('all')
  importAll(): Promise<Record<string, unknown>> {
    return this.service.importAll();
  }

  @Get('utilizzatori')
  importUtilizers(): Promise<{ imported: number; skipped: number }> {
    return this.service.importUtilizers();
  }

  @Get('immobili')
  importAssets(): Promise<{ imported: number; skipped: number }> {
    return this.service.importAssets();
  }

  @Get('aggregati-immobili')
  importAssetAggregators(): Promise<{ imported: number; skipped: number }> {
    return this.service.importAssetAggregators();
  }

  @Get('aggregati-utenze')
  importUtilityAggregators(): Promise<{ imported: number; skipped: number }> {
    return this.service.importUtilityAggregators();
  }

  @Get('capitoli-di-spesa')
  importBudgetChapters(): Promise<{ imported: number; skipped: number }> {
    return this.service.importBudgetChapters();
  }

  @Get('fornitori')
  importSuppliers(): Promise<{ imported: number; skipped: number }> {
    return this.service.importSuppliers();
  }

  @Get('utenze')
  importUtilities(): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { utility_id: string; reason: string }[];
  }> {
    return this.service.importUtilities();
  }

  @Get('fatture')
  importInvoices(): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { invoice_id: string; reason: string }[];
  }> {
    return this.service.importInvoices();
  }

  @Get('concessioni')
  importUtilizerGrants(): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { row: string; reason: string }[];
  }> {
    return this.service.importUtilizerGrants();
  }
}
