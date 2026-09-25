import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from './entity/asset-function.entity';
import { CreateAssetFunctionDto } from './dto/create-asset-function.dto';
import { UpdateAssetFunctionDto } from './dto/update-asset-function.dto';
import { SearchAssetFunctionDto } from './dto/search-asset-function.dto';

@Injectable()
export class AssetFunctionsService extends BaseService<
  AssetFunction,
  CreateAssetFunctionDto,
  UpdateAssetFunctionDto
> {
  protected readonly entityName = 'asset_functions';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(AssetFunction)
    protected readonly repo: Repository<AssetFunction>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  async findAll(filters?: SearchAssetFunctionDto): Promise<AssetFunction[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where(`${alias}.deleted = :deleted_filter`, { deleted_filter: filters.deleted ? 1 : 0 });
    } else {
      qb.where(`${alias}.deleted = :deleted_default`, { deleted_default: 0 });
    }
    this.applyFilters(qb, filters ?? {}, alias, ['deleted']);
    return qb.orderBy(`${alias}.name`, 'ASC').getMany();
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const inUse = await this.assetRepo.count({ where: { function_id: id, deleted: false } });
    if (inUse > 0) {
      throw new ConflictException(
        `Funzione usata da ${inUse} immobili: riclassificarli prima di eliminarla.`,
      );
    }
    return super.remove(id, updatedByUserId);
  }
}
