import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoice.service';
import { InvoicesController } from './invoice.controller';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceLine, BudgetCommitment, Contract])],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
