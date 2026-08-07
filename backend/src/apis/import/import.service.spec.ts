import { Test, TestingModule } from '@nestjs/testing';
import { ImportService } from './import.service';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { ImportEntityType } from './entity-type.enum';

describe('ImportService', () => {
  let service: ImportService;
  let dataImporter: jest.Mocked<DataImporterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        {
          provide: DataImporterService,
          useValue: {
            importAssets: jest.fn(),
            importAssetAggregators: jest.fn(),
            importUtilityAggregators: jest.fn(),
            importBudgetChapters: jest.fn(),
            importSuppliers: jest.fn(),
            importUtilizers: jest.fn(),
            importUtilizerGrants: jest.fn(),
            importUtilities: jest.fn(),
            importInvoices: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ImportService);
    dataImporter = module.get(DataImporterService);
  });

  it('importFromFile per ASSETS delega a dataImporter.importAssets con il path fornito', async () => {
    dataImporter.importAssets.mockResolvedValue({ imported: 5, skipped: 1 });

    const result = await service.importFromFile(ImportEntityType.ASSETS, '/tmp/file.csv');

    expect(dataImporter.importAssets).toHaveBeenCalledWith('/tmp/file.csv');
    expect(result).toEqual({ imported: 5, skipped: 1 });
  });

  it('importFromFile per INVOICES delega a dataImporter.importInvoices', async () => {
    dataImporter.importInvoices.mockResolvedValue({ imported: 2, skipped: 0, skippedRows: [] });

    const result = await service.importFromFile(ImportEntityType.INVOICES, '/tmp/fatture.csv');

    expect(dataImporter.importInvoices).toHaveBeenCalledWith('/tmp/fatture.csv');
    expect(result).toEqual({ imported: 2, skipped: 0, skippedRows: [] });
  });

  it('importFromFile lancia per un entityType non mappato', async () => {
    await expect(
      service.importFromFile('non-esistente' as ImportEntityType, '/tmp/file.csv'),
    ).rejects.toThrow('Tipo entità non supportato');
  });
});
