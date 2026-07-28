import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { CreateConsipAgreementDto } from '@apis/consip-agreement/dto/create-consip-agreement.dto';
import { UpdateConsipAgreementDto } from '@apis/consip-agreement/dto/update-consip-agreement.dto';
import { BaseService } from '@apis/shared/base.service';
import { SearchConsipAgreementDto } from '@apis/consip-agreement/dto/search-consip-agreement.dto';

@Injectable()
export class ConsipAgreementService extends BaseService<
  ConsipAgreement,
  CreateConsipAgreementDto,
  UpdateConsipAgreementDto
> {
  protected readonly entityName = 'consip_agreement';
  protected readonly relations = ['supplier', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(ConsipAgreement)
    protected readonly repo: Repository<ConsipAgreement>,
  ) {
    super();
  }

  async findAll(filters?: SearchConsipAgreementDto): Promise<ConsipAgreement[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });
    qb.leftJoinAndSelect(`${alias}.supplier`, 'supplier');

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        if (key === 'expiration_date_range') {
          const range = value as string[];
          if (range[0]) {
            qb.andWhere(`${alias}.expiration_date >= :expiration_date_start`, {
              expiration_date_start: range[0],
            });
          }
          if (range[1]) {
            qb.andWhere(`${alias}.expiration_date <= :expiration_date_end`, {
              expiration_date_end: range[1],
            });
          }
        } else if (key === 'name' || key === 'description' || key === 'cig_master') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }
    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }
}
