import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entity/asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetDto } from './dto/search-asset.dto';
import { BaseService } from '../shared/base.service';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';

const ADDRESS_FIELDS = ['toponym', 'address', 'civic_number', 'zip_code', 'municipality'] as const;

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
  protected readonly relations = [
    'assetAggregator',
    'assetNature',
    'assetFunction',
    'created_by',
    'updated_by',
  ];

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
    @InjectRepository(AssetAggregator)
    private readonly assetAggregatorRepo: Repository<AssetAggregator>,
    @InjectRepository(AssetNature)
    private readonly natureRepo: Repository<AssetNature>,
  ) {
    super();
    // code è la label breve corretta mostrata ovunque (icone mappa/filtri);
    // description è una nota libera quasi sempre vuota — MAI usarla come
    // label (bug reale corretto altrove nel progetto, vedi
    // asset-filter-dialog.component.ts).
    this.auditLabelResolvers = {
      asset_type_id: { repo: this.assetAggregatorRepo, field: 'code' },
      nature_id: { repo: this.natureRepo, field: 'name' },
    };
  }

  async findAll(filters?: SearchAssetDto): Promise<Asset[]> {
    const qb = this.repo.createQueryBuilder('assets');
    qb.leftJoinAndSelect(
      'assets.assetAggregator',
      'assetAggregator',
      'assetAggregator.deleted = 0',
    );
    qb.leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0');
    qb.leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0');
    // Servono per mostrare "ultima modifica" nell'header del dialog aperto
    // dalla riga di tabella (che usa findAll(), non findOne()) — mancavano
    // qui, presenti solo in findOne(), stesso identico bug già noto per
    // utilityType (vedi commento in findOne() più sotto).
    qb.leftJoinAndSelect('assets.created_by', 'created_by');
    qb.leftJoinAndSelect('assets.updated_by', 'updated_by');
    qb.leftJoinAndSelect('assets.utilities', 'utilities', 'utilities.deleted = 0');
    qb.leftJoinAndSelect('utilities.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where('assets.deleted = :deleted_filter', {
        deleted_filter: filters.deleted ? 1 : 0,
      });
    } else {
      qb.where('assets.deleted = :deleted_default', { deleted_default: 0 });
    }

    if (filters?.legacy_only) {
      qb.andWhere('assets.asset_type_id IS NOT NULL');
    }
    if (filters?.status) {
      qb.andWhere('assets.status = :filter_status', { filter_status: filters.status });
    }

    this.applyFilters(qb, filters ?? {}, 'assets', ['deleted', 'legacy_only', 'status']);

    return qb.orderBy('assets.id', 'ASC').getMany();
  }

  findOne(id: number): Promise<Asset | null> {
    return this.repo
      .createQueryBuilder('assets')
      .leftJoinAndSelect('assets.assetAggregator', 'assetAggregator', 'assetAggregator.deleted = 0')
      .leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0')
      .leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0')
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
      .leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0')
      .where('assets.id = :id', { id })
      .getOne();
  }

  async create(dto: CreateAssetDto, userId?: number): Promise<Asset> {
    await this.assertClassification(dto.nature_id, dto.function_id);
    return super.create(dto, userId);
  }

  countLegacy(): Promise<number> {
    return this.repo
      .createQueryBuilder('assets')
      .where('assets.deleted = 0')
      .andWhere('assets.asset_type_id IS NOT NULL')
      .getCount();
  }

  // Coppia (natura, funzione) ammessa in asset_nature_functions. Funzione
  // senza natura non ha senso (le funzioni ammesse dipendono dalla natura).
  // Natura senza funzione è ammessa: riclassificazione a metà di un immobile
  // legacy, il vecchio tipo resta finché non ci sono entrambe.
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

  async update(id: number, updateDto: UpdateAssetDto, userId?: number): Promise<Asset> {
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

    const payload: UpdateAssetDto & {
      geocoded_latitude?: string | null;
      geocoded_longitude?: string | null;
      geocoded_at?: Date | null;
      asset_type_id?: null;
    } = { ...updateDto };

    // Immobile classificato con natura + funzione: il vecchio tipo
    // (AssetAggregator) non serve più, azzerato (legacy in sola lettura).
    if (natureId != null && functionId != null) {
      payload.asset_type_id = null;
    }

    if (shouldRegeocode) {
      payload.geocoded_latitude = null;
      payload.geocoded_longitude = null;
      payload.geocoded_at = null;
    }

    const result = await super.update(id, payload as UpdateAssetDto, userId);

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
