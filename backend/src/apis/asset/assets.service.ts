import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entity/asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetDto } from './dto/search-asset.dto';
import { BaseService } from '../shared/base.service';
import { GeocodingService } from '@apis/geocoding/geocoding.service';

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
  protected readonly relations = ['assetAggregator', 'created_by', 'updated_by'];

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
  ) {
    super();
  }

  async findAll(filters?: SearchAssetDto): Promise<Asset[]> {
    const qb = this.repo.createQueryBuilder('assets');
    qb.leftJoinAndSelect(
      'assets.assetAggregator',
      'assetAggregator',
      'assetAggregator.deleted = 0',
    );
    qb.leftJoinAndSelect('assets.utilities', 'utilities', 'utilities.deleted = 0');
    qb.leftJoinAndSelect('utilities.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilities.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where('assets.deleted = :deleted_filter', {
        deleted_filter: filters.deleted ? 1 : 0,
      });
    } else {
      qb.where('assets.deleted = :deleted_default', { deleted_default: 0 });
    }

    this.applyFilters(qb, filters ?? {}, 'assets', ['deleted']);

    return qb.orderBy('assets.id', 'ASC').getMany();
  }

  findOne(id: number): Promise<Asset | null> {
    return this.repo
      .createQueryBuilder('assets')
      .leftJoinAndSelect('assets.assetAggregator', 'assetAggregator', 'assetAggregator.deleted = 0')
      .leftJoinAndSelect('assets.created_by', 'created_by')
      .leftJoinAndSelect('assets.updated_by', 'updated_by')
      .leftJoinAndSelect('assets.utilities', 'utilities', 'utilities.deleted = 0')
      .leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0')
      .leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0')
      .where('assets.id = :id', { id })
      .getOne();
  }

  async update(id: number, updateDto: UpdateAssetDto, userId?: number): Promise<Asset> {
    const existing = await this.repo.findOne({ where: { id } as never });
    const addressChanged = ADDRESS_FIELDS.some(
      (field) => field in updateDto && updateDto[field] !== existing?.[field],
    );
    const manualCoordsProvided =
      updateDto.latitude !== undefined || updateDto.longitude !== undefined;
    const shouldRegeocode = addressChanged && !manualCoordsProvided;

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

  // async create(dto: CreateAssetDto, userId?: number): Promise<Asset> {
  //   if (dto.asset_id == 0) {
  //     const result = await this.repo
  //       .createQueryBuilder('assets')
  //       .select('MAX(assets.asset_id)', 'max')
  //       .getRawOne<{ max: number | null }>();
  //     dto.asset_id = (result?.max ?? 0) + 1;
  //   }
  //   return super.create(dto, userId);
  // }

  // async update(id: number, updateDto: UpdateAssetDto, userId?: number): Promise<Asset> {
  //   if (updateDto.asset_type_id !== undefined) {
  //     updateDto.assetAggregator = { id: updateDto.asset_type_id } as AssetAggregator;
  //   }
  //   return super.update(id, updateDto, userId);
  // }
}
