import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UtilityAggregator } from './entity/utility-aggregator.entity';
import { CreateUtilityAggregatorDto } from './dto/create-utility-aggregator.dto';
import { UpdateUtilityAggregatorDto } from './dto/update-utility-aggregator.dto';
import { SearchUtilityAggregatorDto } from './dto/search-utility-aggregator.dto';
import { BaseService } from '@apis/shared/base.service';

@Injectable()
export class UtilityAggregatorsService extends BaseService<
  UtilityAggregator,
  CreateUtilityAggregatorDto,
  UpdateUtilityAggregatorDto
> {
  protected readonly entityName = 'utility_aggregators';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityAggregator)
    protected readonly repo: Repository<UtilityAggregator>,
  ) {
    super();
  }

  async findAll(filters?: SearchUtilityAggregatorDto): Promise<UtilityAggregator[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });

    if (filters) {
      this.applyFilters(qb, filters as Record<string, any>, alias);
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async create(dto: CreateUtilityAggregatorDto, userId?: number): Promise<UtilityAggregator> {
    const existing = await this.repo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('Codice già utilizzato.');
    }
    return super.create(dto, userId);
  }

  async update(
    id: number,
    updateDto: UpdateUtilityAggregatorDto,
    userId?: number,
  ): Promise<UtilityAggregator> {
    if (updateDto.code) {
      const entity = await this.findOne(id);
      if (!entity) throw new BadRequestException('Aggregatore utility non trovato');

      if (updateDto.code !== entity.code) {
        const existing = await this.repo.findOne({ where: { code: updateDto.code } });
        if (existing && existing.id !== id) {
          throw new BadRequestException('Codice già presente');
        }
      }
    }
    return super.update(id, updateDto, userId);
  }
}
