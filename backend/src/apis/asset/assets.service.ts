import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entity/asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetDto } from './dto/search-asset.dto';
import { BaseService } from '../shared/base.service';

@Injectable()
export class AssetsService extends BaseService<Asset, CreateAssetDto, UpdateAssetDto> {
  protected readonly entityName = 'assets';
  protected readonly relations = ['assetAggregator', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Asset)
    protected readonly repo: Repository<Asset>,
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

    this.applyFilters(qb, filters, 'assets', ['deleted']);

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
