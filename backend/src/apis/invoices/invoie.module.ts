import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoice.service';
import { InvoicesController } from './invoice.controller';
import { Invoice } from './entity/invoice.entity';
import { BudgetChapter } from '../budget-chapters/entity/budgetChapter.entity';
import { InvoiceBudgetChapter } from './entity/invoice_budget_chapter.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, BudgetChapter, InvoiceBudgetChapter, Contract])],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
