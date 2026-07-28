import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { SearchPurposeDto } from '@apis/purpose/dto/search-purpose.dto';
import { Purpose } from '@apis/purpose/entity/purpose.entity';
import { CreatePurposeDto } from '@apis/purpose/dto/create-purpose.dto';
import { UpdatePurposeDto } from '@apis/purpose/dto/update-purpose.dto';
import { UtilityTypePurpose } from '@apis/utility-types/entity/utility_type_purpose.entity';

@Injectable()
export class PurposeService extends BaseService<Purpose, CreatePurposeDto, UpdatePurposeDto> {
  protected readonly entityName = 'purpose';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(Purpose)
    protected readonly repo: Repository<Purpose>,
    @InjectRepository(UtilityTypePurpose)
    private readonly utilityTypePurposeRepo: Repository<UtilityTypePurpose>,
  ) {
    super();
  }

  async findAll(filter?: SearchPurposeDto): Promise<Purpose[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        if (key === 'name') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else if (key === 'use_type') {
          qb.andWhere(`${alias}.use_type = :use_type`, { use_type: value });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }
    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new BadRequestException('elemento non trovato');

    await this.utilityTypePurposeRepo.delete({ purpose_id: id });

    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
  }
}
