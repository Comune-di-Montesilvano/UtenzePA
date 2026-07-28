import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BudgetChapter } from './entity/budgetChapter.entity';
import { CreateBudgetChapterDto } from './dto/create-budget-chapters.dto';
import { UpdateBudgetChapterDto } from './dto/update-budget-chapters.dto';
import { SearchBudgetChapterDto } from '@apis/budget-chapters/dto/search-budget-chapter.dto';
import { BaseService } from '@apis/shared/base.service';

const LIKE_FIELDS = ['chapter_code', 'description', 'pdc'];

@Injectable()
export class BudgetChaptersService extends BaseService<
  BudgetChapter,
  CreateBudgetChapterDto,
  UpdateBudgetChapterDto
> {
  protected readonly entityName = 'budget_chapters';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetChapter)
    protected readonly repo: Repository<BudgetChapter>,
  ) {
    super();
  }

  async findAll(filter?: SearchBudgetChapterDto): Promise<BudgetChapter[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;

        if (LIKE_FIELDS.includes(key)) {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }
}
