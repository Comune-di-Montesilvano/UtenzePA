import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { BudgetChapterSpending } from './entity/budget-chapter-spending.entity';
import { BudgetChapterSpendingService } from './budget-chapter-spending.service';
import { BudgetChapterSpendingController } from './budget-chapter-spending.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetChapterSpending, BudgetChapter])],
  providers: [BudgetChapterSpendingService],
  controllers: [BudgetChapterSpendingController],
})
export class BudgetChapterSpendingModule {}
