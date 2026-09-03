import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
import { UtilityAggregator } from '@apis/utility-aggregators/entity/utility-aggregator.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { SupplyTypeEnum } from '@apis/budget-chapters/enum/supply-type.enum';
import { Supplier } from '@apis/shared/entities/supplier.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { CostsBorneBy } from '@apis/shared/entities/utility_cost_borne_by.entity';
import { MaintenanceManager } from '@apis/shared/entities/maintenanceManagers.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { Phase } from '@apis/shared/enum/user.enums';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';

const SYSTEM_USER_ID = 1;

const ASSET_TYPE_MAP: Record<string, number> = {
  CASE: 1,
  SCUOLE: 2,
  'PARCHI,  GIARDINI E ALTRE AREE PUBBLICHE ATTREZZATE': 3,
  SPORT: 4,
  'CABINE O IMPIANTI DI TERZI': 5,
  'CULTURA E MANIFESTAZIONI': 6,
  SOCCORSO: 7,
  'ALTRI FABBRICATI': 8,
  'ATTIVITA SOCIALI': 9,
  CIMITERO: 10,
  COMUNE: 11,
  "FORZE DELL'ORDINE": 12,
  'PUBBLICA ILLUMINAZIONE': 14,
  'ROTATORIE E SEMAFORI': 15,
  'AREE CON CONTATORE DA INDIVIDUARE': 17,
  SPRAR: 19,
  'PUNTO PRESA ACQUA SU AREA PUBBLICA': 20,
  'PUNTO PRESA ENERGIA ELETTRICA SU AREA PUBBLICA': 21,
  'ex PUNTO PRESA ACQUA SU AREA PUBBLICA': 22,
  'ex PUNTO PRESA ENERGIA ELETTRICA SU AREA PUBBLICA': 23,
  'BIKE SHARING E SIMILI': 24,
  "CHIOSCHI E CASETTE D'ACQUA": 25,
  'EX_IMMOBILE LOCATO NON PIU IN USO': 26,
  'STAZIONE AUTOBUS': 27,
};

const SUPPLY_TYPE_MAP: Record<string, SupplyTypeEnum> = {
  'energia elettrica': SupplyTypeEnum.ELECTRICITY,
  'gestione termica': SupplyTypeEnum.THERMAL_MANAGEMENT,
  'solo gas': SupplyTypeEnum.GAS_SUPPLY_ONLY,
  acqua: SupplyTypeEnum.WATER,
  'utenze sprar': SupplyTypeEnum.SPRAR_UTILITIES,
};

@Injectable()
export class DataImporterService {
  private readonly logger = new Logger(DataImporterService.name);

  constructor(
    @InjectRepository(Utilizer)
    private readonly utilizerRepo: Repository<Utilizer>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(AssetAggregator)
    private readonly assetAggregatorRepo: Repository<AssetAggregator>,
    @InjectRepository(UtilityAggregator)
    private readonly utilityAggregatorRepo: Repository<UtilityAggregator>,
    @InjectRepository(BudgetChapter)
    private readonly budgetChapterRepo: Repository<BudgetChapter>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
    @InjectRepository(UtilityType)
    private readonly utilityTypeRepo: Repository<UtilityType>,
    @InjectRepository(CostsBorneBy)
    private readonly costsBorneByRepo: Repository<CostsBorneBy>,
    @InjectRepository(MaintenanceManager)
    private readonly maintenanceManagerRepo: Repository<MaintenanceManager>,
    @InjectRepository(ConsipAgreement)
    private readonly consipAgreementRepo: Repository<ConsipAgreement>,
    @InjectRepository(UtilizerGrant)
    private readonly utilizerGrantRepo: Repository<UtilizerGrant>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  private readCsv(filePath: string): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const results: Record<string, string>[] = [];
      fs.createReadStream(filePath, { encoding: 'latin1' })
        .pipe(csv({ separator: ';' }))
        .on('data', (row: Record<string, string>) => results.push(row))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  private extractCoordinates(coordinate: string): {
    latitude: string | null;
    longitude: string | null;
  } {
    if (!coordinate) return { latitude: null, longitude: null };
    // Cerca il pattern @lat,lng nella URL
    const match = coordinate.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) return { latitude: match[1], longitude: match[2] };
    return { latitude: null, longitude: null };
  }

  async importAll(): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};

    results['assetAggregators'] = await this.importAssetAggregators();
    results['utilityAggregators'] = await this.importUtilityAggregators();
    results['assets'] = await this.importAssets();
    results['suppliers'] = await this.importSuppliers();
    results['budgetChapters'] = await this.importBudgetChapters();
    results['utilizers'] = await this.importUtilizers();
    results['utilizerGrants'] = await this.importUtilizerGrants();
    results['utilities'] = await this.importUtilities();
    results['invoices'] = await this.importInvoices();

    this.logger.log('Import completo eseguito');
    return results;
  }

  async importAssets(
    filePath: string = path.join(process.cwd(), 'src', 'data-importer', 'source', 'immobili.csv'),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const asset_name = row['id_fabbricato']?.trim();
      if (!asset_name) {
        skipped++;
        continue;
      }

      const existing = await this.assetRepo.findOne({ where: { asset_name, deleted: false } });
      if (existing) {
        this.logger.warn(`Asset già presente, skip: "${asset_name}"`);
        skipped++;
        continue;
      }

      // 'tipo immobile' e' un campo lookup di Access: l'export via mdbtools
      // (a differenza dell'export nativo di Access, che risolve il lookup nel
      // testo visualizzato) restituisce l'ID numerico grezzo salvato nella
      // colonna, cioe' l'id di aggregati_immobili/asset_aggregators — non il
      // nome della categoria. Va quindi usato direttamente, non tramite
      // ASSET_TYPE_MAP (che matcha per nome ed e' pensato per un export testuale).
      // ASSET_TYPE_MAP resta come fallback per compatibilita' con CSV storici
      // che contenessero gia' il nome invece dell'id.
      const tipoImmobileRaw = row['tipo immobile']?.trim();
      const tipoImmobileNumeric = parseInt(tipoImmobileRaw ?? '', 10);
      let asset_type_id: number;
      if (tipoImmobileRaw && !isNaN(tipoImmobileNumeric)) {
        asset_type_id = tipoImmobileNumeric;
      } else if (tipoImmobileRaw && ASSET_TYPE_MAP[tipoImmobileRaw.toUpperCase()]) {
        asset_type_id = ASSET_TYPE_MAP[tipoImmobileRaw.toUpperCase()];
      } else {
        asset_type_id = 8; // default: ALTRI FABBRICATI
        if (tipoImmobileRaw) {
          this.logger.warn(
            `"tipo immobile" non riconosciuto (ne' id numerico ne' nome mappato), asset "${asset_name}" categorizzato come ALTRI FABBRICATI: "${tipoImmobileRaw}"`,
          );
        }
      }

      const ownershipRaw =
        row['proprietà']?.trim().toLowerCase() ?? row['propriet\u00e0']?.trim().toLowerCase();
      const ownership = ownershipRaw === 'si' || ownershipRaw === 'sì' ? 1 : 0;

      const { latitude, longitude } = this.extractCoordinates(row['coordinate']?.trim() ?? '');

      const entity = this.assetRepo.create({
        asset_name,
        associated_building: row['fabbricato ASSOCIATO']?.trim() || null,
        toponym: row['Toponimo']?.trim() || null,
        address: row['indirizzo']?.trim() || null,
        civic_number: row['civico']?.trim() || null,
        zip_code: row['cap']?.trim() || null,
        municipality: row['Comune']?.trim() || null,
        ownership,
        specific_details: row['specifiche SU IMMOBILE']?.trim() || null,
        memo: row['PROMEMORIA SU IMMOBILE']?.trim() || null,
        services_and_artifacts: row['servizi / manufatti contenuti']?.trim() || null,
        latitude,
        longitude,
        sheet: row['foglio']?.trim() || null,
        parcel: row['mappale']?.trim() || null,
        subordinate: row['subalterno']?.trim() || null,
        area_sqm: row['superficie']
          ? parseFloat(row['superficie'].replace(',', '.')) || null
          : null,
        cadastral_value: row['valore catastale']
          ? parseFloat(row['valore catastale'].replace(',', '.')) || null
          : null,
        category: row['categoria']?.trim() || null,
        asset_type_id,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.assetRepo.save(entity);
      imported++;
    }

    this.logger.log(`Import assets completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped };
  }

  async importAssetAggregators(
    filePath: string = path.join(
      process.cwd(),
      'src',
      'data-importer',
      'source',
      'aggregati_immobili.csv',
    ),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const code = row['descrizione']?.trim();
      if (!code) {
        skipped++;
        continue;
      }

      // L'id originale della tabella Access va preservato: ASSET_TYPE_MAP (sopra)
      // e' hardcoded sugli id storici di 'aggregati immobili' e assets.asset_type_id
      // punta a questa tabella — un id riassegnato per autoincrement (ordine di
      // riga del CSV, non l'id originale) romperebbe quella mappa in silenzio.
      const originalId = parseInt(row['ID']?.trim() ?? '', 10);
      if (!originalId) {
        this.logger.warn(`AssetAggregator senza ID originale valido, skip: "${code}"`);
        skipped++;
        continue;
      }

      const existing = await this.assetAggregatorRepo.findOne({
        where: [
          { id: originalId, deleted: false },
          { code, deleted: false },
        ],
      });
      if (existing) {
        this.logger.warn(`AssetAggregator già presente, skip: "${code}"`);
        skipped++;
        continue;
      }

      const entity = this.assetAggregatorRepo.create({
        id: originalId,
        code,
        description: row['contenuto']?.trim() || null,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.assetAggregatorRepo.save(entity);
      imported++;
    }

    this.logger.log(
      `Import asset aggregators completato: ${imported} inseriti, ${skipped} saltati`,
    );
    return { imported, skipped };
  }

  async importUtilityAggregators(
    filePath: string = path.join(
      process.cwd(),
      'src',
      'data-importer',
      'source',
      'aggregati_utenze.csv',
    ),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const code = row['descrizione']?.trim();
      if (!code) {
        skipped++;
        continue;
      }

      // L'id originale (colonna id_aggr in Access) va preservato: importUtilities
      // legge 'id_aggr' dal CSV utenze e lo usa come FK diretta verso questa
      // tabella (aggregator_id_fk = parseInt(row['id_aggr'])) — un id riassegnato
      // per autoincrement romperebbe quella FK in silenzio o con violazione.
      const originalId = parseInt(row['id_aggr']?.trim() ?? '', 10);
      if (!originalId) {
        this.logger.warn(`UtilityAggregator senza id_aggr originale valido, skip: "${code}"`);
        skipped++;
        continue;
      }

      const existing = await this.utilityAggregatorRepo.findOne({
        where: [
          { id: originalId, deleted: false },
          { code, deleted: false },
        ],
      });
      if (existing) {
        this.logger.warn(`UtilityAggregator già presente, skip: "${code}"`);
        skipped++;
        continue;
      }

      const entity = this.utilityAggregatorRepo.create({
        id: originalId,
        code,
        description: row['contenuto']?.trim() || null,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.utilityAggregatorRepo.save(entity);
      imported++;
    }

    this.logger.log(
      `Import utility aggregators completato: ${imported} inseriti, ${skipped} saltati`,
    );
    return { imported, skipped };
  }

  async importBudgetChapters(
    filePath: string = path.join(
      process.cwd(),
      'src',
      'data-importer',
      'source',
      'capitoli_di_spesa.csv',
    ),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const chapter_code = row['Capit']?.trim();
      if (!chapter_code) {
        skipped++;
        continue;
      }

      const article = parseInt(row['articolo']?.trim() ?? '0', 10) || 0;

      const existing = await this.budgetChapterRepo.findOne({
        where: { chapter_code, article, deleted: false },
      });
      if (existing) {
        this.logger.warn(`BudgetChapter già presente, skip: "${chapter_code}/${article}"`);
        skipped++;
        continue;
      }

      const supplyTypeRaw = row['tipologia fornitura']?.trim().toLowerCase();
      const supply_type = SUPPLY_TYPE_MAP[supplyTypeRaw] ?? SupplyTypeEnum.ELECTRICITY;

      const entity = this.budgetChapterRepo.create({
        chapter_code,
        article,
        description: row['Descrizione']?.trim() || null,
        pdc: row['pdc']?.trim() || null,
        supply_type,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.budgetChapterRepo.save(entity);
      imported++;
    }

    this.logger.log(`Import budget chapters completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped };
  }

  async importSuppliers(
    filePath: string = path.join(process.cwd(), 'src', 'data-importer', 'source', 'fornitori.csv'),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const supplier_id = row['ID_fornitore']?.trim();
      if (!supplier_id) {
        skipped++;
        continue;
      }

      const existing = await this.supplierRepo.findOne({
        where: { supplier_id, deleted: false },
      });
      if (existing) {
        this.logger.warn(`Supplier già presente, skip: "${supplier_id}"`);
        skipped++;
        continue;
      }

      const cittaSede = row['citt\u00e0 sede']?.trim() || row['citt? sede']?.trim() || '';
      const cityMatch = cittaSede.match(/^(\d{5})\s+(.+)$/);
      const postal_code = cityMatch ? cityMatch[1] : null;
      const city = cityMatch ? cityMatch[2].trim() : cittaSede || null;

      const entity = this.supplierRepo.create({
        supplier_id,
        vat_number: row['partita iva']?.trim() || null,
        tax_code: row['codice fiscale']?.trim() || null,
        company_name: row['ragione sociale']?.trim() || supplier_id,
        address: row['indirizzo sede']?.trim() || null,
        city,
        postal_code,
        email: row['mail']?.trim() || null,
        pec: row['pec']?.trim() || null,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.supplierRepo.save(entity);
      imported++;
    }

    this.logger.log(`Import suppliers completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped };
  }

  async importUtilities(
    filePath: string = path.join(process.cwd(), 'src', 'data-importer', 'source', 'utenze.csv'),
  ): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { utility_id: string; reason: string }[];
  }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    // --- Cache lookup ---
    const suppliers = await this.supplierRepo.find({ where: { deleted: false } });
    const supplierMap = new Map(suppliers.map((s) => [s.supplier_id.toLowerCase(), s.id]));

    const utilityTypes = await this.utilityTypeRepo.find({ where: { deleted: false } });
    const utilityTypeMap = new Map(utilityTypes.map((t) => [t.name.toLowerCase(), t.id]));

    const costsBorneBy = await this.costsBorneByRepo.find({ where: { deleted: false } });
    const costsBorneByMap = new Map(costsBorneBy.map((c) => [c.name.toLowerCase(), c.id]));

    const maintenanceManagers = await this.maintenanceManagerRepo.find({
      where: { deleted: false },
    });
    const maintenanceManagerMap = new Map(
      maintenanceManagers.map((m) => [m.code.toLowerCase(), m.id]),
    );

    const consipAgreements = await this.consipAgreementRepo.find({ where: { deleted: false } });
    const consipAgreementMap = new Map(consipAgreements.map((c) => [c.name.toLowerCase(), c.id]));

    const assets = await this.assetRepo.find({ where: { deleted: false } });
    const assetMap = new Map(assets.map((a) => [a.asset_name?.toLowerCase(), a.id]));

    const budgetChapters = await this.budgetChapterRepo.find({ where: { deleted: false } });
    const budgetChapterMap = new Map(
      budgetChapters.map((b) => [b.chapter_code?.toLowerCase(), b.id]),
    );

    let imported = 0;
    let skipped = 0;
    const skippedRows: { utility_id: string; reason: string }[] = [];

    for (const row of rows) {
      const utility_id = row['ID_utenza']?.trim();
      if (!utility_id) {
        skipped++;
        skippedRows.push({ utility_id: '(vuoto)', reason: 'ID_utenza mancante' });
        continue;
      }

      const existing = await this.utilityRepo.findOne({
        where: { utility_id, deleted: false },
      });
      if (existing) {
        this.logger.warn(`Utility già presente, skip: "${utility_id}"`);
        skipped++;
        skippedRows.push({ utility_id, reason: 'già presente' });
        continue;
      }

      // FK lookups: se il valore testuale non ha match nel master data (gap gia'
      // presente nella fonte Access originale, non un bug di questo import), il
      // record master viene creato al volo invece di lasciare la FK a NULL in
      // silenzio o far fallire l'insert su colonne NOT NULL (utility_type,
      // costs_borne_by). Le mappe cache vengono aggiornate per evitare doppie
      // creazioni sullo stesso valore nello stesso run.
      const supplierRawOriginal = row['fornitore']?.trim();
      const supplierRaw = supplierRawOriginal?.toLowerCase();
      let supplier_id_fk = supplierRaw ? (supplierMap.get(supplierRaw) ?? null) : null;
      if (supplierRaw && supplier_id_fk === null) {
        const newSupplier = await this.supplierRepo.save(
          this.supplierRepo.create({
            supplier_id: supplierRawOriginal,
            company_name: supplierRawOriginal,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          }),
        );
        this.logger.warn(
          `Fornitore non presente in master data, creato al volo: "${supplierRawOriginal}"`,
        );
        supplierMap.set(supplierRaw, newSupplier.id);
        supplier_id_fk = newSupplier.id;
      }

      const utilityTypeRawOriginal = row['tipo utenza']?.trim();
      const utilityTypeRaw = utilityTypeRawOriginal?.toLowerCase();
      let utility_type_id_fk = utilityTypeRaw ? (utilityTypeMap.get(utilityTypeRaw) ?? null) : null;
      if (utilityTypeRaw && utility_type_id_fk === null) {
        const hard_type = utilityTypeRaw.includes('acqua')
          ? HardTypeEnum.WATER
          : utilityTypeRaw.includes('gas')
            ? HardTypeEnum.GAS
            : utilityTypeRaw.includes('internet') || utilityTypeRaw.includes('fibra')
              ? HardTypeEnum.INTERNET
              : HardTypeEnum.LIGHT;
        const newUtilityType = await this.utilityTypeRepo.save(
          this.utilityTypeRepo.create({
            name: utilityTypeRawOriginal,
            hard_type,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          }),
        );
        this.logger.warn(
          `Tipo utenza non presente in master data, creato al volo: "${utilityTypeRawOriginal}" (hard_type=${hard_type})`,
        );
        utilityTypeMap.set(utilityTypeRaw, newUtilityType.id);
        utility_type_id_fk = newUtilityType.id;
      }

      const costsBorneByRawOriginal = row['consumi a carico di']?.trim();
      const costsBorneByRaw = costsBorneByRawOriginal?.toLowerCase();
      let costs_borne_by_id_fk = costsBorneByRaw
        ? (costsBorneByMap.get(costsBorneByRaw) ?? null)
        : null;
      if (costsBorneByRaw && costs_borne_by_id_fk === null) {
        const newCostsBorneBy = await this.costsBorneByRepo.save(
          this.costsBorneByRepo.create({
            name: costsBorneByRawOriginal,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          }),
        );
        this.logger.warn(
          `"Consumi a carico di" non presente in master data, creato al volo: "${costsBorneByRawOriginal}"`,
        );
        costsBorneByMap.set(costsBorneByRaw, newCostsBorneBy.id);
        costs_borne_by_id_fk = newCostsBorneBy.id;
      }

      const maintenanceRawOriginal = row['gestione manutenzione']?.trim();
      const maintenanceRaw = maintenanceRawOriginal?.toLowerCase();
      let maintenance_management_id_fk = maintenanceRaw
        ? (maintenanceManagerMap.get(maintenanceRaw) ?? null)
        : null;
      if (maintenanceRaw && maintenance_management_id_fk === null) {
        const newMaintenanceManager = await this.maintenanceManagerRepo.save(
          this.maintenanceManagerRepo.create({
            code: maintenanceRawOriginal,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          }),
        );
        this.logger.warn(
          `Gestione manutenzione non presente in master data, creata al volo: "${maintenanceRawOriginal}"`,
        );
        maintenanceManagerMap.set(maintenanceRaw, newMaintenanceManager.id);
        maintenance_management_id_fk = newMaintenanceManager.id;
      }

      // ConsipAgreement richiede cig_master (Codice Identificativo Gara reale) e
      // supplier_id NOT NULL: un CIG non puo' essere inventato (dato con valore
      // legale/compliance), quindi la creazione al volo usa un placeholder
      // esplicito ('MANCANTE', entro il limite di 10 char della colonna) da
      // completare a mano in UI, invece di lasciare il link NULL in silenzio.
      const consipRawOriginal = row['mercato di provenienza']?.trim();
      const consipRaw = consipRawOriginal?.toLowerCase();
      let consip_agreement_id = consipRaw ? (consipAgreementMap.get(consipRaw) ?? null) : null;
      if (consipRaw && consip_agreement_id === null) {
        if (supplier_id_fk === null) {
          this.logger.warn(
            `Convenzione Consip "${consipRawOriginal}" non creata al volo: nessun fornitore risolto sulla riga per popolare supplier_id (NOT NULL)`,
          );
        } else {
          const newConsipAgreement = await this.consipAgreementRepo.save(
            this.consipAgreementRepo.create({
              name: consipRawOriginal,
              cig_master: 'MANCANTE',
              supplier_id: supplier_id_fk,
              created_by_user_id: SYSTEM_USER_ID,
              updated_by_user_id: SYSTEM_USER_ID,
            }),
          );
          this.logger.warn(
            `Convenzione Consip non presente in master data, creata al volo con CIG placeholder da completare: "${consipRawOriginal}"`,
          );
          consipAgreementMap.set(consipRaw, newConsipAgreement.id);
          consip_agreement_id = newConsipAgreement.id;
        }
      }

      const assetRaw = row['id_fabbricato']?.trim().toLowerCase();
      const asset_id_fk = assetRaw ? (assetMap.get(assetRaw) ?? null) : null;

      const budgetChapterRaw = row['capitolo spesa']?.trim().toLowerCase();
      const budget_chapter_code_fk = budgetChapterRaw
        ? (budgetChapterMap.get(budgetChapterRaw) ?? null)
        : null;

      const aggregator_id_fk = row['id_aggr']?.trim()
        ? parseInt(row['id_aggr'].trim(), 10) || null
        : null;

      // Date parsing (DD/MM/YYYY → YYYY-MM-DD)
      const parseDate = (val: string): string | null => {
        if (!val?.trim()) return null;
        const match = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;
        return `${match[3]}-${match[2]}-${match[1]}`;
      };

      const supply_start_date = parseDate(row['decorrenza fornitura']);
      const supply_expiry_date = parseDate(row['scadenza affidamento FORNITURA']);
      const management_expiry_date = parseDate(row['scadenza affidamento GESTIONE']);
      const takeover_termination_date = parseDate(row['data voltura o cessazione contatore']);
      const water_concession = parseDate(row['concessione Acqua']);

      // Boolean parsing (SI/NO)
      const parseBool = (val: string): boolean =>
        ['si', 'sì', 'yes', '1'].includes(val?.trim().toLowerCase() ?? '');

      const supply_active = parseBool(row['fornitura attiva']);
      const meter_removed = parseBool(row['contatore rimosso']);
      const meter_verified = parseBool(row['contatore accertato']);

      // Numeric parsing
      const parseDecimal = (val: string): number | null => {
        if (!val?.trim()) return null;
        return parseFloat(val.trim().replace(',', '.')) || null;
      };

      // Phase parsing
      const parsePhase = (val: string): Phase => {
        const v = val?.trim().toLowerCase() ?? '';
        if (v === 'trifase' || v === '3f') return Phase.THREE_PHASE;
        if (v === 'monofase' || v === '1f') return Phase.SINGLE_PHASE;
        return Phase.NOT_APPLICABLE;
      };

      const entity = this.utilityRepo.create({
        utility_id,
        supply_start_date,
        consip_order: row['ordine consip']?.trim() || null,
        supply_expiry_date,
        supplier_id_fk,
        meter_number: row['numero contatore']?.trim() || null,
        utility_type_id_fk,
        utility_code: row['codice utenza o cliente']?.trim() || null,
        wbs_gas_element: row['elemento wbs gas']?.trim() || null,
        supplier_address: row['indirizzo indicato dal Fornitore']?.trim() || null,
        aggregator_id_fk,
        costs_borne_by_id_fk,
        maintenance_management_id_fk,
        consip_agreement_id,
        management_expiry_date,
        takeover_termination_date,
        supply_active,
        meter_removed,
        security_deposit: parseDecimal(row['deposito cauzionale versato']) ?? 0,
        water_concession,
        reported_consumption_year: parseDecimal(row['CONSUMI anno COMUNICATO CONSIP']) ?? 0,
        actual_consumption: 0,
        power_kw_electric: parseDecimal(row['potenza kw energia elettrica']),
        voltage_kw_electric: row['tensione kw energia elettrica']?.trim() || null,
        phase_type_electric: parsePhase(row['tipo fase energia elettrica']),
        estimated_annual_consumption: parseDecimal(row['consumo annuo presunto DA FATTURA']) ?? 0,
        notes: row['NOTE UTENZE']?.trim() || null,
        additional_notes: row['NOTE AGGIUNTIVE UTENZE']?.trim() || null,
        asset_id_fk,
        specifications: row['specifiche']?.trim() || null,
        disconnection_ability: row['disalimentabilIt\u00e0 UTENZA']?.trim() || null,
        meter_verified,
        budget_chapter_code_fk,
        latitude: row['latitudine']?.trim() || null,
        longitude: row['longitudine']?.trim() || null,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      try {
        await this.utilityRepo.save(entity);
        imported++;
      } catch (err) {
        const reason = (err as Error).message;
        this.logger.error(`Errore salvataggio utility "${utility_id}": ${reason}`);
        skipped++;
        skippedRows.push({ utility_id, reason });
      }
    }

    this.logger.log(`Import utilities completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped, skippedRows };
  }

  async importUtilizerGrants(
    filePath: string = path.join(
      process.cwd(),
      'src',
      'data-importer',
      'source',
      'utilizzatori.csv',
    ),
  ): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { row: string; reason: string }[];
  }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    // Cache lookup assets (asset_name → id)
    const assets = await this.assetRepo.find({ where: { deleted: false } });
    const assetMap = new Map(assets.map((a) => [a.asset_name?.toLowerCase(), a.id]));

    // Cache lookup utilizers (name → id)
    const utilizers = await this.utilizerRepo.find({ where: { deleted: false } });
    const utilizerMap = new Map(utilizers.map((u) => [u.name?.toLowerCase(), u.id]));

    let imported = 0;
    let skipped = 0;
    const skippedRows: { row: string; reason: string }[] = [];

    const parseDate = (val: string): string | null => {
      if (!val?.trim()) return null;
      const match = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return null;
      return `${match[3]}-${match[2]}-${match[1]}`;
    };

    const parseBool = (val: string): boolean =>
      ['si', 'sì', 'yes', '1'].includes(val?.trim().toLowerCase() ?? '');

    for (const row of rows) {
      const assetRaw = row['id_fabbricato']?.trim();
      const utilizerRaw = row['utilizzatore']?.trim();
      const rowLabel = `${assetRaw ?? '?'} / ${utilizerRaw ?? '?'}`;

      if (!assetRaw || !utilizerRaw) {
        skipped++;
        skippedRows.push({ row: rowLabel, reason: 'id_fabbricato o utilizzatore mancante' });
        continue;
      }

      const asset_id_fk = assetMap.get(assetRaw.toLowerCase()) ?? null;
      if (!asset_id_fk) {
        skipped++;
        skippedRows.push({ row: rowLabel, reason: `asset non trovato: "${assetRaw}"` });
        continue;
      }

      const utilizer_id_fk = utilizerMap.get(utilizerRaw.toLowerCase()) ?? null;
      if (!utilizer_id_fk) {
        skipped++;
        skippedRows.push({ row: rowLabel, reason: `utilizer non trovato: "${utilizerRaw}"` });
        continue;
      }

      // Skip se già presente
      const existing = await this.utilizerGrantRepo.findOne({
        where: { asset_id_fk, utilizer_id_fk, deleted: false },
      });
      if (existing) {
        skipped++;
        skippedRows.push({ row: rowLabel, reason: 'già presente' });
        continue;
      }

      const expire_date = parseDate(row['SCADENZA']);

      const entity = this.utilizerGrantRepo.create({
        asset_id_fk,
        utilizer_id_fk,
        concession_act: row['atto concessione immobile']?.trim() || null,
        utilities_to_be_taken_over: parseBool(row['utenze da volturare']),
        usage_type: row['tipo utilizzo']?.trim() || null,
        expire_date,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      try {
        await this.utilizerGrantRepo.save(entity);
        imported++;
      } catch (err) {
        const reason = (err as Error).message;
        this.logger.error(`Errore salvataggio utilizer_grant "${rowLabel}": ${reason}`);
        skipped++;
        skippedRows.push({ row: rowLabel, reason });
      }
    }

    this.logger.log(`Import utilizer_grants completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped, skippedRows };
  }

  async importInvoices(
    filePath: string = path.join(process.cwd(), 'src', 'data-importer', 'source', 'fatture.csv'),
  ): Promise<{
    imported: number;
    skipped: number;
    skippedRows: { invoice_id: string; reason: string }[];
  }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    // Cache lookup utilities (utility_id → { id, supplier_id_fk })
    const utilities = await this.utilityRepo.find({ where: { deleted: false } });
    const utilityMap = new Map(utilities.map((u) => [u.utility_id?.toLowerCase(), u]));

    let imported = 0;
    let skipped = 0;
    const skippedRows: { invoice_id: string; reason: string }[] = [];

    const parseDate = (val: string): string | null => {
      if (!val?.trim()) return null;
      const match = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return null;
      return `${match[3]}-${match[2]}-${match[1]}`;
    };

    const parseDecimal = (val: string): number => {
      if (!val?.trim()) return 0;
      return parseFloat(val.trim().replace(',', '.')) || 0;
    };

    for (const row of rows) {
      const rawId = row['ID_fattura']?.trim();
      if (!rawId) {
        skipped++;
        skippedRows.push({ invoice_id: '(vuoto)', reason: 'ID_fattura mancante' });
        continue;
      }

      // Normalizza a 8 caratteri anteponendo zeri
      const invoice_id = rawId.padStart(8, '0');

      const existing = await this.invoiceRepo.findOne({
        where: { invoice_id, deleted: false },
      });
      if (existing) {
        skipped++;
        skippedRows.push({ invoice_id, reason: 'già presente' });
        continue;
      }

      const invoice_date = parseDate(row['data fattura']);
      if (!invoice_date) {
        skipped++;
        skippedRows.push({ invoice_id, reason: 'data fattura mancante o non valida' });
        continue;
      }

      const utilityRaw = row['ID_utenza']?.trim().toLowerCase();
      const utility = utilityRaw ? (utilityMap.get(utilityRaw) ?? null) : null;
      const utility_id_fk = utility?.id ?? null;
      const supplier_id_fk = utility?.supplier_id_fk ?? null;

      const entity = this.invoiceRepo.create({
        invoice_id,
        invoice_date,
        protocol_number: row['n_protocollo']?.trim() || null,
        net_amount_excl_vat: parseDecimal(row['importo al netto di IVA']),
        last_invoice_arrears: parseDecimal(row['morosita ultima fattura']),
        notes_on_invoices: row['note su fatture']?.trim() || null,
        utility_id_fk,
        supplier_id_fk,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      try {
        await this.invoiceRepo.save(entity);
        imported++;
      } catch (err) {
        const reason = (err as Error).message;
        this.logger.error(`Errore salvataggio invoice "${invoice_id}": ${reason}`);
        skipped++;
        skippedRows.push({ invoice_id, reason });
      }
    }

    this.logger.log(`Import invoices completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped, skippedRows };
  }

  async importUtilizers(
    filePath: string = path.join(
      process.cwd(),
      'src',
      'data-importer',
      'source',
      'utilizzatori.csv',
    ),
  ): Promise<{ imported: number; skipped: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File non trovato: ${filePath}`);
    }

    const rows = await this.readCsv(filePath);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = row['utilizzatore']?.trim();
      if (!name) {
        skipped++;
        continue;
      }

      const existing = await this.utilizerRepo.findOne({ where: { name, deleted: false } });
      if (existing) {
        this.logger.warn(`Utilizzatore già presente, skip: "${name}"`);
        skipped++;
        continue;
      }

      const entity = this.utilizerRepo.create({
        name,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      });

      await this.utilizerRepo.save(entity);
      imported++;
    }

    this.logger.log(`Import completato: ${imported} inseriti, ${skipped} saltati`);
    return { imported, skipped };
  }
}
