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
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';

const mockRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
});

describe('DataImporterService', () => {
  let service: DataImporterService;
  let module: TestingModule;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-importer-test-'));

    module = await Test.createTestingModule({
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
        { provide: getRepositoryToken(Contract), useFactory: mockRepo },
        { provide: getRepositoryToken(ContractUtility), useFactory: mockRepo },
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

  it('importUtilities crea Contract e ContractUtility quando la riga ha dati contrattuali (fornitore/date)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplierRepo = module.get(getRepositoryToken(Supplier)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const utilityRepo = module.get(getRepositoryToken(Utility)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractRepo = module.get(getRepositoryToken(Contract)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractUtilityRepo = module.get(getRepositoryToken(ContractUtility)) as any;

    supplierRepo.save.mockImplementationOnce((x: Record<string, unknown>) =>
      Promise.resolve({ ...x, id: 42 }),
    );
    utilityRepo.save.mockImplementationOnce((x: Record<string, unknown>) =>
      Promise.resolve({ ...x, id: 7 }),
    );
    contractRepo.save.mockImplementationOnce((x: Record<string, unknown>) =>
      Promise.resolve({ ...x, id: 55 }),
    );

    const csvPath = path.join(tmpDir, 'utenze.csv');
    fs.writeFileSync(
      csvPath,
      'ID_utenza;fornitore;decorrenza fornitura;scadenza affidamento FORNITURA\n' +
        '0001;ACME SPA;01/01/2026;31/12/2026\n',
      { encoding: 'latin1' },
    );

    const result = await service.importUtilities(csvPath);

    expect(result).toEqual({ imported: 1, skipped: 0, skippedRows: [] });
    expect(contractRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id_fk: 42,
        supply_start_date: '2026-01-01',
        supply_expiry_date: '2026-12-31',
      }),
    );
    expect(contractRepo.save).toHaveBeenCalled();
    expect(contractUtilityRepo.create).toHaveBeenCalledWith({
      contract_id: 55,
      utility_id: 7,
    });
    expect(contractUtilityRepo.save).toHaveBeenCalled();
  });

  it('importInvoices risolve contratto_id_fk per una fattura la cui utenza ha un contratto associato, anche se scaduto', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const utilityRepo = module.get(getRepositoryToken(Utility)) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceRepo = module.get(getRepositoryToken(Invoice)) as any;

    utilityRepo.find.mockResolvedValueOnce([{ id: 5, utility_id: 'u1' }]);
    // Il contratto risolto (id 55) e' collegato all'utenza anche se la query
    // reale (manager.query) non filtra piu' su scadenza dopo il fix
    // Important 3 — qui simuliamo direttamente il risultato della query per
    // isolare la logica di risoluzione contratto_id_fk sulla entity fattura.
    invoiceRepo.manager = {
      query: jest.fn().mockResolvedValue([{ utility_id: 5, contract_id: 55 }]),
    };

    const csvPath = path.join(tmpDir, 'fatture.csv');
    fs.writeFileSync(
      csvPath,
      'ID_fattura;data fattura;ID_utenza\n12345;01/01/2026;u1\n',
      { encoding: 'latin1' },
    );

    const result = await service.importInvoices(csvPath);

    expect(result).toEqual({ imported: 1, skipped: 0, skippedRows: [] });
    expect(invoiceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ contratto_id_fk: 55 }),
    );
    // Verifica che il fix Important 3 sia in vigore: la query di risoluzione
    // contratto non filtra piu' su supply_expiry_date.
    const [sql] = invoiceRepo.manager.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('supply_expiry_date');
  });
});
