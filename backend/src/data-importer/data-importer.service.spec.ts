import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataImporterService } from './data-importer.service';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
import { UtilityAggregator } from '@apis/utility-aggregators/entity/utility-aggregator.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Supplier } from '@apis/shared/entities/supplier.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { CostsBorneBy } from '@apis/shared/entities/utility_cost_borne_by.entity';
import { MaintenanceManager } from '@apis/shared/entities/maintenanceManagers.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';

const mockRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
});

describe('DataImporterService', () => {
  let service: DataImporterService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-importer-test-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImporterService,
        { provide: getRepositoryToken(Utilizer), useFactory: mockRepo },
        { provide: getRepositoryToken(Asset), useFactory: mockRepo },
        { provide: getRepositoryToken(AssetAggregator), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilityAggregator), useFactory: mockRepo },
        { provide: getRepositoryToken(BudgetChapter), useFactory: mockRepo },
        { provide: getRepositoryToken(Supplier), useFactory: mockRepo },
        { provide: getRepositoryToken(Utility), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilityType), useFactory: mockRepo },
        { provide: getRepositoryToken(CostsBorneBy), useFactory: mockRepo },
        { provide: getRepositoryToken(MaintenanceManager), useFactory: mockRepo },
        { provide: getRepositoryToken(ConsipAgreement), useFactory: mockRepo },
        { provide: getRepositoryToken(UtilizerGrant), useFactory: mockRepo },
        { provide: getRepositoryToken(Invoice), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(DataImporterService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('importUtilizers usa il path custom quando fornito', async () => {
    const customPath = path.join(tmpDir, 'custom.csv');
    fs.writeFileSync(customPath, 'utilizzatore\nMario Rossi\n', { encoding: 'latin1' });

    const result = await service.importUtilizers(customPath);

    expect(result).toEqual({ imported: 1, skipped: 0 });
  });

  it('importUtilizers lancia se il path custom non esiste', async () => {
    const missingPath = path.join(tmpDir, 'missing.csv');

    await expect(service.importUtilizers(missingPath)).rejects.toThrow('File non trovato');
  });

  it('tutti i metodi importXxx accettano un filePath opzionale (stesso pattern)', () => {
    const importMethods: (keyof DataImporterService)[] = [
      'importAssets',
      'importAssetAggregators',
      'importUtilityAggregators',
      'importBudgetChapters',
      'importSuppliers',
      'importUtilities',
      'importUtilizerGrants',
      'importInvoices',
      'importUtilizers',
    ];

    for (const methodName of importMethods) {
      const method = service[methodName] as (...args: unknown[]) => unknown;
      expect(typeof method).toBe('function');
      // .length riflette solo i parametri senza default, quindi con un
      // parametro opzionale (filePath = default) la funzione dichiara
      // arity 0 pur accettando un argomento a runtime.
      expect(method.length).toBe(0);
    }
  });
});
