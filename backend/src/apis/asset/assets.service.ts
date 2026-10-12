import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entity/asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetDto } from './dto/search-asset.dto';
import { BaseService } from '../shared/base.service';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { Complex } from '@apis/complexes/entity/complex.entity';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { AssetCadastralUnit } from './entity/asset-cadastral-unit.entity';
import { CadastralUnitDto } from './dto/cadastral-unit.dto';
import { AssetMef, computeAssetMef } from './asset-mef';

const ADDRESS_FIELDS = ['toponym', 'address', 'civic_number', 'zip_code', 'municipality'] as const;

export type AssetWithMef = Asset & { mef: AssetMef };

type UnitLike = Partial<Pick<AssetCadastralUnit, 'section' | 'subordinate' | 'category'>> & {
  sheet: string;
  parcel: string;
  cadastral_income?: number | string | null;
};

// Testo di un'unità per l'audit e per capire se le unità sono cambiate.
const unitLabel = (u: UnitLike): string =>
  [
    u.section ? `sez. ${u.section}` : null,
    `foglio ${u.sheet}`,
    `part. ${u.parcel}`,
    u.subordinate ? `sub. ${u.subordinate}` : null,
    u.category || null,
    u.cadastral_income != null && u.cadastral_income !== ''
      ? `rendita ${Number(u.cadastral_income).toFixed(2)}`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
const unitsText = (units: UnitLike[]): string => units.map(unitLabel).sort().join('; ');

export interface RegeocodeAllStatus {
  running: boolean;
  forceAll: boolean;
  total: number;
  processed: number;
  geocoded: number;
  skippedNoAddress: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

@Injectable()
export class AssetsService extends BaseService<Asset, CreateAssetDto, UpdateAssetDto> {
  protected readonly entityName = 'assets';
  protected readonly relations = ['assetNature', 'assetFunction', 'created_by', 'updated_by'];

  private readonly logger = new Logger(AssetsService.name);

  // Stato del job di rigeocodifica bulk in memoria di processo — un solo job
  // alla volta, nessuna persistenza tra riavvii ne' coordinamento multi-istanza
  // (coerente con l'architettura single-instance del resto dell'app, niente
  // job queue/Redis). Se il container viene riavviato a job in corso lo stato
  // si perde, ma le scritture gia' fatte sul DB restano.
  private regeocodeAllStatus: RegeocodeAllStatus = {
    running: false,
    forceAll: false,
    total: 0,
    processed: 0,
    geocoded: 0,
    skippedNoAddress: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
  };

  constructor(
    @InjectRepository(Asset)
    protected readonly repo: Repository<Asset>,
    private readonly geocodingService: GeocodingService,
    @InjectRepository(AssetNature)
    private readonly natureRepo: Repository<AssetNature>,
    @InjectRepository(Complex)
    private readonly complexRepo: Repository<Complex>,
    @InjectRepository(AssetCadastralUnit)
    private readonly unitRepo: Repository<AssetCadastralUnit>,
  ) {
    super();
    this.auditLabelResolvers = {
      nature_id: { repo: this.natureRepo, field: 'name' },
      complex_id: { repo: this.complexRepo, field: 'name' },
    };
  }

  protected today(): string {
    return todayIso();
  }

  // Dati MEF calcolati, aggiunti sull'istanza (non una copia: remove() la salva).
  private withMef(asset: Asset): AssetWithMef {
    const mef = computeAssetMef(
      {
        ownership: asset.ownership,
        status: asset.status ?? null,
        cadastral_unit_count: asset.cadastralUnits?.length ?? 0,
        function: asset.assetFunction ?? null,
        grants: asset.utilizerGrants ?? [],
      },
      this.today(),
    );
    return Object.assign(asset, { mef });
  }

  async findAll(filters?: SearchAssetDto): Promise<AssetWithMef[]> {
    const qb = this.repo.createQueryBuilder('assets');
    qb.leftJoinAndSelect('assets.cadastralUnits', 'cadastralUnits');
    qb.leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0');
    qb.leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0');
    qb.leftJoinAndSelect('assets.complex', 'complex', 'complex.deleted = 0');
    // Servono per mostrare "ultima modifica" nell'header del dialog aperto
    // dalla riga di tabella (che usa findAll(), non findOne()) — mancavano
    // qui, presenti solo in findOne(), stesso identico bug già noto per
    // utilityType (vedi commento in findOne() più sotto).
    qb.leftJoinAndSelect('assets.created_by', 'created_by');
    qb.leftJoinAndSelect('assets.updated_by', 'updated_by');
    qb.leftJoinAndSelect('assets.utilities', 'utilities', 'utilities.deleted = 0');
    qb.leftJoinAndSelect('utilities.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.parties', 'grantParties', 'grantParties.deleted = 0');

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where('assets.deleted = :deleted_filter', {
        deleted_filter: filters.deleted ? 1 : 0,
      });
    } else {
      qb.where('assets.deleted = :deleted_default', { deleted_default: 0 });
    }

    // Immobili da classificare: senza natura o funzione (banner e filtro).
    if (filters?.legacy_only) {
      qb.andWhere('(assets.nature_id IS NULL OR assets.function_id IS NULL)');
    }
    if (filters?.status) {
      qb.andWhere('assets.status = :filter_status', { filter_status: filters.status });
    }

    // Foglio e particella stanno sulle unità catastali: uguaglianza esatta
    // (il LIKE di applyFilters troverebbe il foglio 16 cercando 1).
    for (const field of ['sheet', 'parcel'] as const) {
      const value = filters?.[field]?.trim();
      if (value) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM asset_cadastral_units u_${field} WHERE u_${field}.asset_id = assets.id AND u_${field}.${field} = :filter_unit_${field})`,
          { [`filter_unit_${field}`]: value },
        );
      }
    }
    if (filters?.legal_nature) {
      qb.andWhere('assets.legal_nature = :filter_legal_nature', {
        filter_legal_nature: filters.legal_nature,
      });
    }

    this.applyFilters(qb, filters ?? {}, 'assets', [
      'deleted',
      'legacy_only',
      'status',
      'sheet',
      'parcel',
      'legal_nature',
      'usage',
    ]);

    const rows = (
      await qb.orderBy('assets.id', 'ASC').addOrderBy('cadastralUnits.id', 'ASC').getMany()
    ).map((a) => this.withMef(a));
    return filters?.usage ? rows.filter((a) => a.mef.usage === filters.usage) : rows;
  }

  async findOne(id: number): Promise<AssetWithMef | null> {
    const asset = await this.repo
      .createQueryBuilder('assets')
      .leftJoinAndSelect('assets.cadastralUnits', 'cadastralUnits')
      .leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0')
      .leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0')
      .leftJoinAndSelect('assets.complex', 'complex', 'complex.deleted = 0')
      .leftJoinAndSelect('assets.created_by', 'created_by')
      .leftJoinAndSelect('assets.updated_by', 'updated_by')
      .leftJoinAndSelect('assets.utilities', 'utilities', 'utilities.deleted = 0')
      // Mancava rispetto a findAll() sopra — mai emerso prima perche' finora
      // nessun punto della UI apriva il dialog immobile passando da un
      // singolo GET (sempre via la riga gia' caricata dalla tabella, che usa
      // findAll() e quindi aveva gia' utilityType). Bug reale: senza questo
      // join, u.utilityType e' sempre undefined qui, e
      // AssetEditDialogComponent.getUtilitiesByHardType (filtra su
      // u.utilityType?.hard_type) mostra 0 utenze per ogni tipo anche
      // quando ce ne sono — scoperto aprendo il dialog immobile da dentro
      // il dialog contatore (nuovo flusso di navigazione impilata).
      .leftJoinAndSelect('utilities.utilityType', 'utilityType', 'utilityType.deleted = 0')
      .leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0')
      .leftJoinAndSelect('utilizerGrants.parties', 'grantParties', 'grantParties.deleted = 0')
      .where('assets.id = :id', { id })
      .orderBy('cadastralUnits.id', 'ASC')
      .getOne();
    return asset ? this.withMef(asset) : null;
  }

  async create(dto: CreateAssetDto, userId?: number): Promise<Asset> {
    await this.assertClassification(dto.nature_id, dto.function_id);
    await this.assertComplex(dto.complex_id);
    const { cadastral_units: units, ...rest } = dto;
    const saved = await super.create(rest as CreateAssetDto, userId);
    if (units?.length) {
      const rows = this.toUnitRows(saved.id, units);
      try {
        saved.cadastralUnits = await this.unitRepo.save(rows);
      } catch (error) {
        this.manageErrors(error, 'Errore durante il salvataggio delle unità catastali');
      }
      if (userId !== undefined) {
        await this.recordAudit(AuditAction.UPDATE, saved.id, userId, [
          { fieldName: 'cadastral_units', oldValue: null, newValue: unitsText(rows as UnitLike[]) },
        ]);
      }
    }
    // Stessa forma di findOne (dati MEF calcolati compresi).
    return (await this.findOne(saved.id)) ?? this.withMef(saved);
  }

  // Un complesso cancellato o inesistente non si assegna (stesso messaggio della scheda complesso).
  private async assertComplex(complexId: number | null | undefined): Promise<void> {
    if (complexId === null || complexId === undefined) return;
    const found = await this.complexRepo.findOne({ where: { id: complexId, deleted: false } });
    if (!found) throw new BadRequestException('Complesso non trovato');
  }

  private toUnitRows(assetId: number, units: CadastralUnitDto[]): Partial<AssetCadastralUnit>[] {
    return units.map((u) => ({
      asset_id: assetId,
      section: u.section ?? null,
      sheet: u.sheet,
      parcel: u.parcel,
      subordinate: u.subordinate ?? null,
      category: u.category ?? null,
      cadastral_income: u.cadastral_income ?? null,
    }));
  }

  // Sostituisce in blocco le unità dell'immobile; audit solo se cambiano.
  private async replaceUnits(
    assetId: number,
    units: CadastralUnitDto[],
    previous: AssetCadastralUnit[],
    userId?: number,
  ): Promise<void> {
    const rows = this.toUnitRows(assetId, units);
    // Cancellazione e inserimento insieme: se l'inserimento fallisce restano
    // le unità di prima (e due salvataggi concorrenti non le sommano).
    try {
      await this.unitRepo.manager.transaction(async (m) => {
        await m.delete(AssetCadastralUnit, { asset_id: assetId });
        if (rows.length) await m.save(AssetCadastralUnit, rows);
      });
    } catch (error) {
      this.manageErrors(error, 'Errore durante il salvataggio delle unità catastali');
    }
    const before = unitsText(previous);
    const after = unitsText(rows as UnitLike[]);
    if (before !== after && userId !== undefined) {
      await this.recordAudit(AuditAction.UPDATE, assetId, userId, [
        { fieldName: 'cadastral_units', oldValue: before || null, newValue: after || null },
      ]);
    }
  }

  countLegacy(): Promise<number> {
    return this.repo
      .createQueryBuilder('assets')
      .where('assets.deleted = 0')
      .andWhere('(assets.nature_id IS NULL OR assets.function_id IS NULL)')
      .getCount();
  }

  // Coppia (natura, funzione) ammessa in asset_nature_functions. Funzione
  // senza natura non ha senso (le funzioni ammesse dipendono dalla natura).
  // Natura senza funzione è ammessa: classificazione a metà, l'immobile resta
  // tra quelli da classificare.
  private async assertClassification(
    natureId: number | null | undefined,
    functionId: number | null | undefined,
  ): Promise<void> {
    if (functionId != null && natureId == null) {
      throw new BadRequestException('Selezionare la tipologia prima della funzione.');
    }
    if (natureId == null || functionId == null) return;
    const allowed = await this.natureRepo
      .createQueryBuilder('n')
      .innerJoin('n.functions', 'f', 'f.id = :functionId AND f.deleted = 0', { functionId })
      .where('n.id = :natureId AND n.deleted = 0', { natureId })
      .getCount();
    if (allowed === 0) {
      throw new BadRequestException('Combinazione tipologia/funzione non ammessa.');
    }
  }

  async update(id: number, dto: UpdateAssetDto, userId?: number): Promise<Asset> {
    const { cadastral_units: units, ...updateDto } = dto;
    const existing = await this.repo.findOne({ where: { id } as never });
    const addressChanged = ADDRESS_FIELDS.some(
      (field) => field in updateDto && updateDto[field] !== existing?.[field],
    );
    const manualCoordsProvided =
      updateDto.latitude !== undefined || updateDto.longitude !== undefined;
    const shouldRegeocode = addressChanged && !manualCoordsProvided;

    const natureId = 'nature_id' in updateDto ? updateDto.nature_id : existing?.nature_id;
    const functionId = 'function_id' in updateDto ? updateDto.function_id : existing?.function_id;
    await this.assertClassification(natureId, functionId);
    if ('complex_id' in updateDto) await this.assertComplex(updateDto.complex_id);

    const payload: UpdateAssetDto & {
      geocoded_latitude?: string | null;
      geocoded_longitude?: string | null;
      geocoded_at?: Date | null;
    } = { ...updateDto };

    if (shouldRegeocode) {
      payload.geocoded_latitude = null;
      payload.geocoded_longitude = null;
      payload.geocoded_at = null;
    }

    const previousUnits =
      units !== undefined
        ? await this.unitRepo.find({ where: { asset_id: id }, order: { id: 'ASC' } })
        : [];
    let result = await super.update(id, payload as UpdateAssetDto, userId);
    if (units !== undefined) {
      await this.replaceUnits(id, units, previousUnits, userId);
      result = (await this.findOne(id)) ?? result;
    }

    if (shouldRegeocode) {
      await this.regeocode(result).catch(() => undefined);
    }

    return result;
  }

  getRegeocodeAllStatus(): RegeocodeAllStatus {
    return { ...this.regeocodeAllStatus };
  }

  /**
   * Avvia (fire-and-forget) la rigeocodifica bulk di tutti gli asset con
   * indirizzo costruibile. Non awaited dal controller: puo' durare diversi
   * minuti (throttle Nominatim ~1.1s/richiesta + eventuali retry su 429),
   * incompatibile con una singola richiesta HTTP sincrona. Lo stato va
   * interrogato via getRegeocodeAllStatus() (polling frontend).
   *
   * forceAll=false (default): salta gli asset che hanno gia'
   * geocoded_latitude/geocoded_longitude valorizzati — piu' veloce, non
   * ripete lavoro gia' fatto. forceAll=true: ri-geocodifica anche quelli,
   * utile per correggere in blocco geocodifiche vecchie o sospette (es. dopo
   * il fix del bug virgola/punto sulle coordinate manuali delle utenze,
   * stesso principio potrebbe aver influenzato dati storici altrove).
   *
   * Non tocca mai latitude/longitude (posizione GPS manuale): ha sempre
   * precedenza su quella geocodificata, vedi MapService.resolveAssetPosition.
   */
  startRegeocodeAll(forceAll: boolean): RegeocodeAllStatus {
    if (this.regeocodeAllStatus.running) {
      return this.getRegeocodeAllStatus();
    }

    this.regeocodeAllStatus = {
      running: true,
      forceAll,
      total: 0,
      processed: 0,
      geocoded: 0,
      skippedNoAddress: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    // Non awaited di proposito: il chiamante (controller) ritorna subito lo
    // stato "running", il lavoro prosegue in background sull'event loop.
    void this.runRegeocodeAll(forceAll);

    return this.getRegeocodeAllStatus();
  }

  private async runRegeocodeAll(forceAll: boolean): Promise<void> {
    try {
      const assets = await this.repo.find({ where: { deleted: false } as never });
      const targets = forceAll
        ? assets
        : assets.filter((a) => !a.geocoded_latitude || !a.geocoded_longitude);

      this.regeocodeAllStatus.total = targets.length;

      for (const asset of targets) {
        const query = this.geocodingService.buildQuery(asset);
        if (!query) {
          this.regeocodeAllStatus.skippedNoAddress++;
          this.regeocodeAllStatus.processed++;
          continue;
        }

        const result = await this.geocodingService.geocode(query);
        if (!result) {
          this.regeocodeAllStatus.failed++;
          this.regeocodeAllStatus.processed++;
          continue;
        }

        await this.repo.update(asset.id, {
          geocoded_latitude: result.lat,
          geocoded_longitude: result.lon,
          geocoded_at: new Date(),
        } as never);
        this.regeocodeAllStatus.geocoded++;
        this.regeocodeAllStatus.processed++;
      }
    } catch (error) {
      this.logger.error(`Rigeocodifica bulk fallita: ${(error as Error).message}`);
    } finally {
      this.regeocodeAllStatus.running = false;
      this.regeocodeAllStatus.finishedAt = new Date().toISOString();
    }
  }

  private async regeocode(asset: Asset): Promise<void> {
    const query = this.geocodingService.buildQuery(asset);
    if (!query) return;

    const geocoded = await this.geocodingService.geocode(query);
    if (!geocoded) return;

    await this.repo.update(asset.id, {
      geocoded_latitude: geocoded.lat,
      geocoded_longitude: geocoded.lon,
      geocoded_at: new Date(),
    } as never);
  }
}
