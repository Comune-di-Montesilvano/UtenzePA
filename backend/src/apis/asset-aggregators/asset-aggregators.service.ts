import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetAggregator } from './entity/asset-aggregator.entity';
import { CreateAssetAggregatorDto } from './dto/create-asset-aggregator.dto';
import { UpdateAssetAggregatorDto } from './dto/update-asset-aggregator.dto';
import { SearchAssetAggregatorDto } from './dto/search-asset-aggregator.dto';
import { BaseService } from '@/apis/shared/base.service';

@Injectable()
export class AssetAggregatorsService extends BaseService<
  AssetAggregator,
  CreateAssetAggregatorDto,
  UpdateAssetAggregatorDto
> {
  protected readonly entityName = 'asset_aggregators';
  protected readonly relations: string[] = [];

  constructor(
    @InjectRepository(AssetAggregator)
    protected readonly repo: Repository<AssetAggregator>,
  ) {
    super();
  }

  async findAll(filters?: SearchAssetAggregatorDto): Promise<AssetAggregator[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where(`${alias}.deleted = :deleted_filter`, {
        deleted_filter: filters.deleted ? 1 : 0,
      });
    } else {
      qb.where(`${alias}.deleted = :deleted_default`, { deleted_default: 0 });
    }

    this.applyFilters(qb, filters ?? {}, alias, ['deleted']);

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async create(dto: CreateAssetAggregatorDto, userId?: number): Promise<AssetAggregator> {
    const existing = await this.repo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('Codice già utilizzato.');
    }
    return super.create(dto, userId);
  }

  async update(
    id: number,
    updateDto: UpdateAssetAggregatorDto,
    userId?: number,
  ): Promise<AssetAggregator> {
    const entity = await this.findOne(id);
    if (!entity) {
      throw new BadRequestException('Aggregatore asset non trovato');
    }
    if (updateDto.code && updateDto.code !== entity.code) {
      const existing = await this.repo.findOne({ where: { code: updateDto.code } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('Codice già presente');
      }
    }
    return super.update(id, updateDto, userId);
  }

  async remove(id: number, updatedByUserId?: number): Promise<void> {
    return super.remove(id, updatedByUserId ?? 0);
  }
}
