import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitmentsController } from './budget-commitments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetCommitment, Contract, BudgetChapter, InvoiceLine])],
  providers: [BudgetCommitmentsService],
  controllers: [BudgetCommitmentsController],
})
export class BudgetCommitmentsModule {}
