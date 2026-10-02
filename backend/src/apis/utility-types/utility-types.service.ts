import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { UtilityType } from './entity/utility_type.entity';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';
import { SearchUtilityTypeDto } from './dto/search-utility-type.dto';

@Injectable()
export class UtilityTypesService extends BaseService<
  UtilityType,
  CreateUtilityTypeDto,
  UpdateUtilityTypeDto
> {
  protected readonly entityName = 'utility_types';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityType)
    protected readonly repo: Repository<UtilityType>,
  ) {
    super();
  }

  async findAll(filter?: SearchUtilityTypeDto): Promise<UtilityType[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: filter?.deleted ?? false });

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || key === 'deleted') return;

        if (key === 'name' || key === 'description') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else if (key === 'hard_type') {
          qb.andWhere(`${alias}.hard_type = :hard_type`, { hard_type: value });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }
}
