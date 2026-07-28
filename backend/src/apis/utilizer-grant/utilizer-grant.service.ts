import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UtilizerGrant } from './entity/utilizer-grant.entity';
import { CreateUtilizerGrantDto } from './dto/create-utilizer-grant.dto';
import { UpdateUtilizerGrantDto } from './dto/update-utilizer-grant.dto';
import { SearchUtilizerGrantDto } from '@apis/utilizer-grant/dto/search-utilizer-grant.dto';
import { BaseService } from '@apis/shared/base.service';

@Injectable()
export class UtilizerGrantService extends BaseService<
  UtilizerGrant,
  CreateUtilizerGrantDto,
  UpdateUtilizerGrantDto
> {
  protected readonly entityName = 'utilizer_grant';
  protected readonly relations = ['asset', 'utilizer', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilizerGrant)
    protected readonly repo: Repository<UtilizerGrant>,
  ) {
    super();
  }

  async findAll(filters?: SearchUtilizerGrantDto): Promise<UtilizerGrant[]> {
    const qb = this.repo.createQueryBuilder('UtilizerGrant');

    qb.leftJoinAndSelect('UtilizerGrant.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('UtilizerGrant.utilizer', 'utilizer', 'utilizer.deleted = 0');

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where('UtilizerGrant.deleted = :deleted_filter', {
        deleted_filter: filters.deleted ? 1 : 0,
      });
    } else {
      qb.where('UtilizerGrant.deleted = :deleted_default', { deleted_default: 0 });
    }

    if (filters.grant_date) {
      qb.andWhere('DATE(UtilizerGrant.grant_date) = DATE(:grant_date)', {
        grant_date: filters.grant_date,
      });
    }

    if (filters.expire_date) {
      qb.andWhere('DATE(UtilizerGrant.expire_date) = DATE(:expire_date)', {
        expire_date: filters.expire_date,
      });
    }

    this.applyFilters(qb, filters, 'UtilizerGrant', ['deleted', 'grant_date', 'expire_date']);

    return qb.orderBy('UtilizerGrant.id', 'ASC').getMany();
  }
}
