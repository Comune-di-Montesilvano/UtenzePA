import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetChapter } from './entity/budgetChapter.entity';
import { BudgetChaptersService } from './budget-chapters.service';
import { BudgetChaptersController } from './budget-chapters.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetChapter])],
  providers: [BudgetChaptersService],
  controllers: [BudgetChaptersController],
  exports: [BudgetChaptersService],
})
export class BudgetChaptersModule {}
