import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from './entity/budget-chapter-spending.entity';
import { CreateBudgetChapterSpendingDto } from './dto/create-budget-chapter-spending.dto';
import { UpdateBudgetChapterSpendingDto } from './dto/update-budget-chapter-spending.dto';

@Injectable()
export class BudgetChapterSpendingService extends BaseService<
  BudgetChapterSpending,
  CreateBudgetChapterSpendingDto,
  UpdateBudgetChapterSpendingDto
> {
  protected readonly entityName = 'budget_chapter_spending';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetChapterSpending)
    protected readonly repo: Repository<BudgetChapterSpending>,
    @InjectRepository(BudgetChapter)
    private readonly chapterRepo: Repository<BudgetChapter>,
  ) {
    super();
  }

  async findByChapter(chapterId: number): Promise<BudgetChapterSpending[]> {
    const rows = await this.repo.find({
      where: { budget_chapter_id_fk: chapterId, deleted: false },
    });
    return rows.map((r) => ({ ...r, amount: Number(r.amount) })).sort((a, b) => b.year - a.year);
  }

  async createForChapter(
    chapterId: number,
    dto: CreateBudgetChapterSpendingDto,
    userId: number,
  ): Promise<BudgetChapterSpending> {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
    await this.ensureYearFree(chapterId, dto.year);
    return super.create({ ...dto, budget_chapter_id_fk: chapterId } as never, userId);
  }

  async update(
    id: number,
    dto: UpdateBudgetChapterSpendingDto,
    userId?: number,
  ): Promise<BudgetChapterSpending> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Spesa non trovata');
    if (dto.year !== undefined && dto.year !== current.year) {
      await this.ensureYearFree(current.budget_chapter_id_fk, dto.year, id);
    }
    return super.update(id, dto, userId);
  }

  private async ensureYearFree(chapterId: number, year: number, exceptId?: number): Promise<void> {
    const rows = await this.repo.find({
      where: { budget_chapter_id_fk: chapterId, deleted: false },
    });
    if (rows.some((r) => r.year === year && r.id !== exceptId)) {
      throw new BadRequestException(`Spesa del ${year} già presente per questo capitolo.`);
    }
  }
}
