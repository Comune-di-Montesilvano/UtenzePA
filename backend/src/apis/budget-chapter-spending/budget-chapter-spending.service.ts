import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import {
  assertCanChange,
  assertCanCreate,
  changedFields,
} from '@apis/accounting-import/accounting-lock';
import { AccountingStateService } from '@apis/accounting-import/accounting-state.service';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from './entity/budget-chapter-spending.entity';
import { CreateBudgetChapterSpendingDto } from './dto/create-budget-chapter-spending.dto';
import { UpdateBudgetChapterSpendingDto } from './dto/update-budget-chapter-spending.dto';

const AMOUNTS = ['initial_budget', 'adjusted_budget', 'amount'] as const;
const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

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
    @Optional() private readonly accounting?: AccountingStateService,
  ) {
    super();
  }

  async findByChapter(chapterId: number): Promise<BudgetChapterSpending[]> {
    const rows = await this.repo.find({
      where: { budget_chapter_id_fk: chapterId, deleted: false },
    });
    return rows
      .map((r) => ({
        ...r,
        amount: toNumber(r.amount),
        initial_budget: toNumber(r.initial_budget),
        adjusted_budget: toNumber(r.adjusted_budget),
      }))
      .sort((a, b) => b.year - a.year);
  }

  private assertSomeAmount(values: Partial<Record<(typeof AMOUNTS)[number], unknown>>): void {
    if (AMOUNTS.every((k) => values[k] === null || values[k] === undefined)) {
      throw new BadRequestException(
        'Indicare almeno un importo: stanziamento iniziale, assestato o spesa ragioneria.',
      );
    }
  }

  async createForChapter(
    chapterId: number,
    dto: CreateBudgetChapterSpendingDto,
    userId: number,
  ): Promise<BudgetChapterSpending> {
    await assertCanCreate(this.accounting);
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
    this.assertSomeAmount(dto);
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
    await assertCanChange(
      this.accounting,
      current,
      changedFields(current, dto, ['year', ...AMOUNTS]).length > 0,
    );
    this.assertSomeAmount({ ...current, ...dto });
    if (dto.year !== undefined && dto.year !== current.year) {
      await this.ensureYearFree(current.budget_chapter_id_fk, dto.year, id);
    }
    return super.update(id, dto, userId);
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (current) await assertCanChange(this.accounting, current, true);
    return super.remove(id, updatedByUserId);
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
