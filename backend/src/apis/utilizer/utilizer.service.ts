import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Utilizer } from './entity/utilizer.entity';
import { CreateUtilizerDto } from './dto/create-utilizer.dto';
import { UpdateUtilizerDto } from './dto/update-utilizer.dto';
import { SearchUtilizerGrantDto } from '@apis/utilizer-grant/dto/search-utilizer-grant.dto';
import { BaseService } from '@apis/shared/base.service';

@Injectable()
export class UtilizerService extends BaseService<Utilizer, CreateUtilizerDto, UpdateUtilizerDto> {
  protected readonly entityName = 'utilizer';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(Utilizer)
    protected readonly repo: Repository<Utilizer>,
  ) {
    super();
  }

  async findAll(filters?: SearchUtilizerGrantDto): Promise<Utilizer[]> {
    const qb = this.repo.createQueryBuilder('Utilizer');

    qb.where('Utilizer.deleted = :deleted', { deleted: false });

    this.applyFilters(qb, filters, 'Utilizer', ['deleted']);

    return qb.orderBy('Utilizer.id', 'ASC').getMany();
  }
}
