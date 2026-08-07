import { Injectable } from '@nestjs/common';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { ImportEntityType } from './entity-type.enum';

@Injectable()
export class ImportService {
  constructor(private readonly dataImporter: DataImporterService) {}

  async importFromFile(entityType: ImportEntityType, filePath: string): Promise<Record<string, unknown>> {
    switch (entityType) {
      case ImportEntityType.ASSETS:
        return this.dataImporter.importAssets(filePath);
      case ImportEntityType.ASSET_AGGREGATORS:
        return this.dataImporter.importAssetAggregators(filePath);
      case ImportEntityType.UTILITY_AGGREGATORS:
        return this.dataImporter.importUtilityAggregators(filePath);
      case ImportEntityType.BUDGET_CHAPTERS:
        return this.dataImporter.importBudgetChapters(filePath);
      case ImportEntityType.SUPPLIERS:
        return this.dataImporter.importSuppliers(filePath);
      case ImportEntityType.UTILIZERS:
        return this.dataImporter.importUtilizers(filePath);
      case ImportEntityType.UTILIZER_GRANTS:
        return this.dataImporter.importUtilizerGrants(filePath);
      case ImportEntityType.UTILITIES:
        return this.dataImporter.importUtilities(filePath);
      case ImportEntityType.INVOICES:
        return this.dataImporter.importInvoices(filePath);
      default:
        throw new Error('Tipo entità non supportato');
    }
  }
}
