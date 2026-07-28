import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostsBorneBy } from '../shared/entities/utility_cost_borne_by.entity';

@Injectable()
export class CostsBorneByService {
  constructor(
    @InjectRepository(CostsBorneBy)
    private readonly costsBornByRepo: Repository<CostsBorneBy>,
  ) {}

  async findAll(): Promise<CostsBorneBy[]> {
    const qb = this.costsBornByRepo.createQueryBuilder('costs_borne_by');
    qb.where('costs_borne_by.deleted = :deleted', { deleted: false });
    return qb.orderBy('costs_borne_by.id', 'ASC').getMany();
  }
}
