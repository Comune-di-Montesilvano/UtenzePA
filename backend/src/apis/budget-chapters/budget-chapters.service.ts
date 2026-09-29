import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BudgetChapter } from './entity/budgetChapter.entity';
import { CreateBudgetChapterDto } from './dto/create-budget-chapters.dto';
import { UpdateBudgetChapterDto } from './dto/update-budget-chapters.dto';
import { SearchBudgetChapterDto } from '@apis/budget-chapters/dto/search-budget-chapter.dto';
import { BaseService } from '@apis/shared/base.service';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { CONSUMPTION_UNIT } from '@apis/utility-consumptions/consumption-unit';


export interface ChapterConsumptionSummaryRow {
  hard_type: HardTypeEnum;
  unit: string | null;
  utilities_count: number;
  estimated_sum: number;
  actual_sum: number;
}

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
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
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

  // Totali presunto/effettivo 12 mesi delle utenze del capitolo, uno per
  // tipo (unità diverse non si sommano: un capitolo SPRAR può contenere
  // luce, gas e acqua). SUM sui valori già persistiti dal ricalcolo.
  async getConsumptionSummary(chapterId: number): Promise<ChapterConsumptionSummaryRow[]> {
    const rows: { hard_type: HardTypeEnum; utilities_count: string; estimated_sum: string | null; actual_sum: string | null }[] =
      await this.utilityRepo
        .createQueryBuilder('u')
        .innerJoin('u.utilityType', 'ut')
        .select('ut.hard_type', 'hard_type')
        .addSelect('COUNT(u.id)', 'utilities_count')
        .addSelect('SUM(u.estimated_annual_consumption)', 'estimated_sum')
        .addSelect('SUM(u.actual_consumption)', 'actual_sum')
        .where('u.deleted = 0')
        .andWhere('u.budget_chapter_code_fk = :chapterId', { chapterId })
        .andWhere('ut.hard_type <> :internet', { internet: HardTypeEnum.INTERNET })
        .groupBy('ut.hard_type')
        .orderBy('ut.hard_type', 'ASC')
        .getRawMany();

    return rows.map((r) => ({
      hard_type: r.hard_type,
      unit: CONSUMPTION_UNIT[r.hard_type] ?? null,
      utilities_count: Number(r.utilities_count),
      estimated_sum: Number(r.estimated_sum ?? 0),
      actual_sum: Number(r.actual_sum ?? 0),
    }));
  }
}
