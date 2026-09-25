import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetNature } from './entity/asset-nature.entity';
import { CreateAssetNatureDto } from './dto/create-asset-nature.dto';
import { UpdateAssetNatureDto } from './dto/update-asset-nature.dto';
import { SearchAssetNatureDto } from './dto/search-asset-nature.dto';

@Injectable()
export class AssetNaturesService extends BaseService<
  AssetNature,
  CreateAssetNatureDto,
  UpdateAssetNatureDto
> {
  protected readonly entityName = 'asset_natures';
  protected readonly relations = ['functions', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(AssetNature)
    protected readonly repo: Repository<AssetNature>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  async findAll(filters?: SearchAssetNatureDto): Promise<AssetNature[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.leftJoinAndSelect(`${alias}.functions`, 'functions', 'functions.deleted = 0');
    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where(`${alias}.deleted = :deleted_filter`, { deleted_filter: filters.deleted ? 1 : 0 });
    } else {
      qb.where(`${alias}.deleted = :deleted_default`, { deleted_default: 0 });
    }
    this.applyFilters(qb, filters ?? {}, alias, ['deleted']);
    return qb.orderBy(`${alias}.name`, 'ASC').getMany();
  }

  async create(dto: CreateAssetNatureDto, userId?: number): Promise<AssetNature> {
    const { function_ids, ...rest } = dto;
    const entity = this.repo.create({
      ...rest,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      functions: this.toFunctionRefs(function_ids ?? []),
    });
    let saved: AssetNature;
    try {
      saved = await this.repo.save(entity);
    } catch (error) {
      this.manageErrors(error, 'Errore durante la creazione della natura immobile');
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateAssetNatureDto, userId?: number): Promise<AssetNature> {
    const { function_ids, ...rest } = dto;

    if (function_ids !== undefined) {
      const current = await this.repo.findOne({ where: { id }, relations: { functions: true } });
      if (!current) throw new BadRequestException('Natura immobile non trovata');
      const removed = (current.functions ?? [])
        .map((f) => f.id)
        .filter((fid) => !function_ids.includes(fid));
      if (removed.length > 0) {
        const inUse = await this.assetRepo.count({
          where: { nature_id: id, function_id: In(removed), deleted: false },
        });
        if (inUse > 0) {
          throw new ConflictException(
            `Impossibile rimuovere funzioni ammesse: ${inUse} immobili usano queste combinazioni.`,
          );
        }
      }
    }

    await super.update(id, rest as UpdateAssetNatureDto, userId);

    if (function_ids !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { functions: true } });
      entity.functions = this.toFunctionRefs(function_ids);
      await this.repo.save(entity);
    }

    return this.findOne(id);
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const inUse = await this.assetRepo.count({ where: { nature_id: id, deleted: false } });
    if (inUse > 0) {
      throw new ConflictException(
        `Natura usata da ${inUse} immobili: riclassificarli prima di eliminarla.`,
      );
    }
    return super.remove(id, updatedByUserId);
  }

  private toFunctionRefs(ids: number[]): AssetFunction[] {
    return [...new Set(ids)].map((fid) => ({ id: fid }) as AssetFunction);
  }
}
